import { Injectable } from '@nestjs/common';
import { TransferRecord } from './transfer.types';

/** In-memory stand-in for unit tests (same API as TransferStore). */
@Injectable()
export class MemoryTransferStore {
	private readonly byId = new Map<string, TransferRecord>();
	private readonly byIdempotencyKey = new Map<string, string>();

	async findUnique(args: {
		where: { id?: string; idempotencyKey?: string };
	}): Promise<TransferRecord | null> {
		if (args.where.id) {
			return this.byId.get(args.where.id) ?? null;
		}
		if (args.where.idempotencyKey) {
			const id = this.byIdempotencyKey.get(args.where.idempotencyKey);
			return id ? (this.byId.get(id) ?? null) : null;
		}
		return null;
	}

	async create(args: { data: TransferRecord }): Promise<TransferRecord> {
		const row = { ...args.data };
		this.byId.set(row.id, row);
		this.byIdempotencyKey.set(row.idempotencyKey, row.id);
		return row;
	}

	async update(args: {
		where: { id: string };
		data: Partial<TransferRecord>;
	}): Promise<TransferRecord> {
		const current = this.byId.get(args.where.id);
		if (!current) {
			throw new Error(`Transfer ${args.where.id} not found`);
		}
		const next: TransferRecord = {
			...current,
			...args.data,
			updatedAt: new Date(),
		};
		this.byId.set(next.id, next);
		return next;
	}

	async findDueCompensations(now = new Date()): Promise<TransferRecord[]> {
		return [...this.byId.values()].filter(
			(t) =>
				t.status === 'Compensating' &&
				t.compensationAction != null &&
				(t.nextRetryAt == null || t.nextRetryAt <= now),
		);
	}
}
