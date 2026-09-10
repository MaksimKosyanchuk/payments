import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaCompensation, toPrismaStatus, toTransferRecord } from './transfer.mapper';
import { TransferRecord } from './transfer.types';

@Injectable()
export class TransferStore {
	constructor(private readonly prisma: PrismaService) {}

	async findUnique(args: {
		where: { id?: string; idempotencyKey?: string };
	}): Promise<TransferRecord | null> {
		const row = args.where.id
			? await this.prisma.transfer.findUnique({ where: { id: args.where.id } })
			: args.where.idempotencyKey
				? await this.prisma.transfer.findUnique({
						where: { idempotencyKey: args.where.idempotencyKey },
					})
				: null;
		return row ? toTransferRecord(row) : null;
	}

	async create(args: { data: TransferRecord }): Promise<TransferRecord> {
		const d = args.data;
		const row = await this.prisma.transfer.create({
			data: {
				id: d.id,
				idempotencyKey: d.idempotencyKey,
				fromWalletId: d.fromWalletId,
				toWalletId: d.toWalletId,
				toIdentifier: d.toIdentifier,
				amount: new Prisma.Decimal(d.amount.toFixed(2)),
				currency: d.currency,
				toCurrency: d.toCurrency,
				amountTo: new Prisma.Decimal(d.amountTo.toFixed(2)),
				fxRate: new Prisma.Decimal(d.fxRate),
				status: toPrismaStatus(d.status),
				currentStep: d.currentStep,
				holdId: d.holdId,
				failureReason: d.failureReason,
				compensationAction: toPrismaCompensation(d.compensationAction) ?? null,
				attempts: d.attempts,
				nextRetryAt: d.nextRetryAt,
				initiatorId: d.initiatorId,
			},
		});
		return toTransferRecord(row);
	}

	async completeWithOutbox(
		transferId: string,
		event: {
			eventId: string;
			type: string;
			correlationId: string | null;
			payload: Prisma.InputJsonValue;
		},
	): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await tx.transfer.update({
				where: { id: transferId },
				data: {
					status: 'Completed',
					currentStep: 'complete',
					failureReason: null,
					compensationAction: null,
					nextRetryAt: null,
				},
			});

			await tx.sagaStep.create({
				data: {
					sagaId: transferId,
					step: 'complete',
					status: 'succeeded',
					error: null,
				},
			});

			await tx.outboxMessage.create({
				data: {
					eventId: event.eventId,
					type: event.type,
					correlationId: event.correlationId,
					publishedAt: null,
					payload: event.payload,
				},
			});
		});
	}

	async failWithOutbox(
		transferId: string,
		input: {
			step: string;
			failureReason: string;
			holdId?: string | null;
			event: {
				eventId: string;
				type: string;
				correlationId: string | null;
				payload: Prisma.InputJsonValue;
			};
		},
	): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await tx.transfer.update({
				where: { id: transferId },
				data: {
					status: 'Failed',
					currentStep: input.step,
					failureReason: input.failureReason,
					compensationAction: null,
					nextRetryAt: null,
					...(input.holdId !== undefined
						? { holdId: input.holdId }
						: {}),
				},
			});

			await tx.sagaStep.create({
				data: {
					sagaId: transferId,
					step: input.step,
					status: 'failed',
					error: input.failureReason,
				},
			});

			await tx.outboxMessage.create({
				data: {
					eventId: input.event.eventId,
					type: input.event.type,
					correlationId: input.event.correlationId,
					publishedAt: null,
					payload: input.event.payload,
				},
			});
		});
	}

	async update(args: {
		where: { id: string };
		data: Partial<TransferRecord>;
	}): Promise<TransferRecord> {
		const d = args.data;
		try {
			const row = await this.prisma.transfer.update({
				where: { id: args.where.id },
				data: {
					...(d.toWalletId !== undefined ? { toWalletId: d.toWalletId } : {}),
					...(d.toIdentifier !== undefined ? { toIdentifier: d.toIdentifier } : {}),
					...(d.status !== undefined ? { status: toPrismaStatus(d.status) } : {}),
					...(d.currentStep !== undefined ? { currentStep: d.currentStep } : {}),
					...(d.holdId !== undefined ? { holdId: d.holdId } : {}),
					...(d.failureReason !== undefined ? { failureReason: d.failureReason } : {}),
					...(d.compensationAction !== undefined
						? { compensationAction: toPrismaCompensation(d.compensationAction) }
						: {}),
					...(d.attempts !== undefined ? { attempts: d.attempts } : {}),
					...(d.nextRetryAt !== undefined ? { nextRetryAt: d.nextRetryAt } : {}),
					...(d.amount !== undefined
						? { amount: new Prisma.Decimal(d.amount.toFixed(2)) }
						: {}),
					...(d.currency !== undefined ? { currency: d.currency } : {}),
					...(d.toCurrency !== undefined ? { toCurrency: d.toCurrency } : {}),
					...(d.amountTo !== undefined
						? { amountTo: new Prisma.Decimal(d.amountTo.toFixed(2)) }
						: {}),
					...(d.fxRate !== undefined ? { fxRate: new Prisma.Decimal(d.fxRate) } : {}),
					...(d.initiatorId !== undefined ? { initiatorId: d.initiatorId } : {}),
				},
			});
			return toTransferRecord(row);
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
				throw new NotFoundException(`Transfer ${args.where.id} not found`);
			}
			throw err;
		}
	}

	/** Stuck compensations due for retry (worker / cron). */
	async findDueCompensations(now = new Date()): Promise<TransferRecord[]> {
		const rows = await this.prisma.transfer.findMany({
			where: {
				status: 'Compensating',
				compensationAction: { not: null },
				OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
			},
			orderBy: { updatedAt: 'asc' },
			take: 50,
		});
		return rows.map(toTransferRecord);
	}

	/** Sent or received for a wallet (history feed). */
	async listForWallet(walletId: string, take = 50): Promise<TransferRecord[]> {
		const rows = await this.prisma.transfer.findMany({
			where: {
				OR: [{ fromWalletId: walletId }, { toWalletId: walletId }],
			},
			orderBy: { createdAt: 'desc' },
			take,
		});
		return rows.map(toTransferRecord);
	}

	/** Admin: recent transfers with saga step timeline. */
	async listRecentWithSteps(take = 20) {
		const rows = await this.prisma.transfer.findMany({
			orderBy: { createdAt: 'desc' },
			take: Math.min(Math.max(take, 1), 100),
			include: {
				steps: { orderBy: { at: 'asc' } },
			},
		});
		return rows.map((row) => {
			const t = toTransferRecord(row);
			const steps = row.steps.map((s) => ({
				id: s.id,
				step: s.step,
				status: s.status,
				error: s.error,
				at: s.at.toISOString(),
			}));
			const durationMs =
				row.updatedAt.getTime() - row.createdAt.getTime();
			return {
				...t,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
				durationMs,
				steps,
			};
		});
	}

	async appendStep(input: {
		sagaId: string;
		step: string;
		status: 'started' | 'succeeded' | 'failed' | 'compensated' | 'skipped';
		error?: string | null;
	}): Promise<void> {
		await this.prisma.sagaStep.create({
			data: {
				sagaId: input.sagaId,
				step: input.step,
				status: input.status,
				error: input.error ?? null,
			},
		});
	}
}
