import { Injectable, Optional } from '@nestjs/common';
import { TransferRecord } from './transfer.types';
import { OutboxService } from '../outbox/outbox.service';
import { TRANSFER_OUTBOX_EVENT } from './transfer.events';

/** In-memory stand-in for unit tests (same API as TransferStore). */
@Injectable()
export class MemoryTransferStore {
    private readonly byId = new Map<string, TransferRecord>();
    private readonly byIdempotencyKey = new Map<string, string>();
    readonly steps: Array<{
        sagaId: string;
        step: string;
        status: 'started' | 'succeeded' | 'failed' | 'compensated' | 'skipped';
        error?: string | null;
    }> = [];

    constructor(@Optional() private readonly outbox?: OutboxService) {}

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

    async completeWithOutbox(
        transferId: string,
        event: {
            eventId: string;
            type: string;
            correlationId: string | null;
            payload: any;
        },
    ): Promise<void> {
        const current = this.byId.get(transferId);
        if (!current) {
            throw new Error(`Transfer ${transferId} not found`);
        }
        const next: TransferRecord = {
            ...current,
            status: 'Completed',
            currentStep: 'complete',
            failureReason: null,
            compensationAction: null,
            nextRetryAt: null,
            updatedAt: new Date(),
        };
        this.byId.set(transferId, next);
        this.steps.push({
            sagaId: transferId,
            step: 'complete',
            status: 'succeeded',
            error: null,
        });

        if (this.outbox) {
            const ctx = {
                transferId: current.id,
                idempotencyKey: current.idempotencyKey,
                fromWalletId: current.fromWalletId,
                toWalletIdentifier: current.toIdentifier,
                amount: current.amount,
                currency: current.currency,
                toCurrency: current.toCurrency,
                amountTo: current.amountTo,
                fxRate: current.fxRate,
                toWalletId: current.toWalletId,
            };
            await this.outbox.enqueueTransferEvent(TRANSFER_OUTBOX_EVENT.Completed, ctx, {
                status: 'Completed',
                currentStep: 'complete',
            });
        }
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
                payload: any;
            };
        },
    ): Promise<void> {
        const current = this.byId.get(transferId);
        if (!current) {
            throw new Error(`Transfer ${transferId} not found`);
        }
        const next: TransferRecord = {
            ...current,
            status: 'Failed',
            currentStep: input.step,
            failureReason: input.failureReason,
            compensationAction: null,
            nextRetryAt: null,
            ...(input.holdId !== undefined ? { holdId: input.holdId } : {}),
            updatedAt: new Date(),
        };
        this.byId.set(transferId, next);
        this.steps.push({
            sagaId: transferId,
            step: input.step,
            status: 'failed',
            error: input.failureReason,
        });

        if (this.outbox) {
            const ctx = {
                transferId: current.id,
                idempotencyKey: current.idempotencyKey,
                fromWalletId: current.fromWalletId,
                toWalletIdentifier: current.toIdentifier,
                amount: current.amount,
                currency: current.currency,
                toCurrency: current.toCurrency,
                amountTo: current.amountTo,
                fxRate: current.fxRate,
                toWalletId: current.toWalletId,
            };
            await this.outbox.enqueueTransferEvent(TRANSFER_OUTBOX_EVENT.Failed, ctx, {
                status: 'Failed',
                currentStep: input.step,
                holdId: next.holdId,
                failureReason: input.failureReason,
            });
        }
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

    async listForWallet(walletId: string, take = 50): Promise<TransferRecord[]> {
        return [...this.byId.values()]
            .filter((t) => t.fromWalletId === walletId || t.toWalletId === walletId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take);
    }

    async appendStep(input: {
        sagaId: string;
        step: string;
        status: 'started' | 'succeeded' | 'failed' | 'compensated' | 'skipped';
        error?: string | null;
    }): Promise<void> {
        this.steps.push(input);
    }
}