import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { SagaService } from '../saga/saga.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferStore } from './transfer.store';
import { TransferRecord, TransferSagaContext } from './transfer.types';

const ALLOWED_CURRENCIES = new Set(['USD', 'EUR', 'UAH']);

@Injectable()
export class TransfersService {
	constructor(
		private readonly transfer: TransferStore,
		private readonly sagaService: SagaService,
	) {}

	async create(
		dto: CreateTransferDto,
		idempotencyKeyHeader?: string,
	): Promise<{ id: string; status: string }> {
		const idempotencyKey = this.resolveIdempotencyKey(dto, idempotencyKeyHeader);
		this.assertCreateInput(dto, idempotencyKey);

		const existing = await this.transfer.findUnique({
			where: { idempotencyKey },
		});
		if (existing) {
			return { id: existing.id, status: existing.status };
		}

		const currency = dto.currency.toUpperCase();
		const now = new Date();
		let transfer: TransferRecord;
		try {
			transfer = await this.transfer.create({
				data: {
					id: randomUUID(),
					idempotencyKey,
					fromWalletId: dto.fromWalletId,
					toWalletId: null,
					toIdentifier: dto.toWalletIdentifier.trim(),
					amount: dto.amount,
					currency,
					toCurrency: currency, // placeholder until saga resolves recipient
					amountTo: dto.amount,
					fxRate: 1,
					status: 'Pending',
					currentStep: null,
					holdId: null,
					failureReason: null,
					compensationAction: null,
					attempts: 0,
					nextRetryAt: null,
					createdAt: now,
					updatedAt: now,
				},
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
				const raced = await this.transfer.findUnique({ where: { idempotencyKey } });
				if (raced) {
					return { id: raced.id, status: raced.status };
				}
			}
			throw err;
		}

		const ctx = this.toSagaContext(transfer);
		await this.sagaService.executeTransfer(ctx);

		const fresh = await this.transfer.findUnique({ where: { id: transfer.id } });
		return { id: transfer.id, status: fresh?.status ?? transfer.status };
	}

	async getStatus(id: string): Promise<TransferRecord> {
		if (!id?.trim()) {
			throw new BadRequestException('Transfer id is required');
		}

		const transfer = await this.transfer.findUnique({ where: { id } });
		if (!transfer) {
			throw new NotFoundException('Transfer not found');
		}
		return transfer;
	}

	private resolveIdempotencyKey(dto: CreateTransferDto, header?: string): string {
		const key = (header?.trim() || dto.idempotencyKey?.trim() || '').trim();
		if (!key) {
			throw new BadRequestException(
				'Idempotency-Key header or idempotencyKey body field is required',
			);
		}
		if (key.length < 8 || key.length > 128) {
			throw new BadRequestException('Idempotency key must be 8–128 characters');
		}
		return key;
	}

	private assertCreateInput(dto: CreateTransferDto, _idempotencyKey: string): void {
		if (!dto.fromWalletId?.trim()) {
			throw new BadRequestException('fromWalletId is required');
		}
		const to = dto.toWalletIdentifier?.trim();
		if (!to) {
			throw new BadRequestException('toWalletIdentifier is required');
		}
		if (dto.fromWalletId === to) {
			throw new BadRequestException('Cannot transfer to the same wallet');
		}
		if (typeof dto.amount !== 'number' || Number.isNaN(dto.amount)) {
			throw new BadRequestException('amount must be a number');
		}
		if (dto.amount <= 0) {
			throw new BadRequestException('amount must be positive');
		}
		if (!Number.isFinite(dto.amount)) {
			throw new BadRequestException('amount must be finite');
		}
		// money: max 2 decimal places
		if (Math.round(dto.amount * 100) / 100 !== dto.amount) {
			throw new BadRequestException('amount must have at most 2 decimal places');
		}
		const currency = dto.currency?.trim().toUpperCase();
		if (!currency || !ALLOWED_CURRENCIES.has(currency)) {
			throw new BadRequestException('currency must be one of USD, EUR, UAH');
		}
	}

	private toSagaContext(transfer: TransferRecord): TransferSagaContext {
		return {
			transferId: transfer.id,
			idempotencyKey: transfer.idempotencyKey,
			fromWalletId: transfer.fromWalletId,
			toWalletIdentifier: transfer.toIdentifier,
			amount: transfer.amount,
			currency: transfer.currency,
			toCurrency: transfer.toCurrency,
			amountTo: transfer.amountTo,
			fxRate: transfer.fxRate,
		};
	}
}
