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
		await this.prisma.outboxMessage.create({
			data: {
				eventId: randomUUID(),
				type,
				correlationId: ctx.transferId,
				publishedAt: null,
				payload: {
					transferId: ctx.transferId,
					status: extra.status,
					currentStep: extra.currentStep ?? null,
					fromWalletId: ctx.fromWalletId,
					toWalletId: extra.toWalletId ?? null,
					toIdentifier: ctx.toWalletIdentifier,
					amount: ctx.amount,
					currency: ctx.currency,
					amountTo: ctx.amountTo,
					toCurrency: ctx.toCurrency,
					fxRate: ctx.fxRate,
					holdId: extra.holdId ?? null,
					failureReason: extra.failureReason ?? null,
				} as Prisma.InputJsonValue,
			},
		});
	}
}
