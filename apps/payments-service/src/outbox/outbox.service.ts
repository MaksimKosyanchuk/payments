import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TransferOutboxEventType } from '../transfers/transfer.events';
import { TransferSagaContext } from '../transfers/transfer.types';

@Injectable()
export class OutboxService {
	constructor(private readonly prisma: PrismaService) {}

	async findPending(maxMessages = 100) {
		return this.prisma.outboxMessage.findMany({
			where: { publishedAt: null },
			orderBy: { createdAt: 'asc' },
			take: maxMessages,
		});
	}

	async markPublished(id: string) {
		await this.prisma.outboxMessage.update({
			where: { id },
			data: { publishedAt: new Date() },
		});
	}

	/** Persist domain event for async publish to Redis Streams. */
	async enqueueEvent(
		type: string,
		payload: Record<string, unknown>,
		correlationId?: string | null,
	): Promise<void> {
		await this.prisma.outboxMessage.create({
			data: {
				eventId: randomUUID(),
				type,
				correlationId: correlationId ?? null,
				publishedAt: null,
				payload: payload as Prisma.InputJsonValue,
			},
		});
	}

	async enqueueTransferEvent(
		type: TransferOutboxEventType,
		ctx: TransferSagaContext,
		extra: {
			status: string;
			currentStep?: string | null;
			holdId?: string | null;
			toWalletId?: string | null;
			failureReason?: string | null;
		},
	): Promise<void> {
		await this.enqueueEvent(
			type,
			{
				transferId: ctx.transferId,
				status: extra.status,
				currentStep: extra.currentStep ?? null,
				fromWalletId: ctx.fromWalletId,
				toWalletId: extra.toWalletId ?? ctx.toWalletId ?? null,
				toIdentifier: ctx.toWalletIdentifier,
				amount: ctx.amount,
				currency: ctx.currency,
				amountTo: ctx.amountTo,
				toCurrency: ctx.toCurrency,
				fxRate: ctx.fxRate,
				holdId: extra.holdId ?? null,
				failureReason: extra.failureReason ?? null,
				initiatorId: ctx.initiatorId ?? null,
				recipientOwnerId: ctx.recipientOwnerId ?? null,
			},
			ctx.transferId,
		);
	}
}
