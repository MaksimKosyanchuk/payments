import { Injectable, Logger } from '@nestjs/common';
import { FxService } from '../fx/fx.service';
import { LedgerClient, LedgerHttpError } from '../ledger/ledger.client';
import { OutboxService } from '../outbox/outbox.service';
import { TRANSFER_OUTBOX_EVENT } from '../transfers/transfer.events';
import { TransferStore } from '../transfers/transfer.store';
import {
	CompensationAction,
	TransferRecord,
	TransferSagaContext,
	TransferStatus,
} from '../transfers/transfer.types';

const COMPENSATION_BACKOFF_MS = 5_000;
const COMPENSATION_MAX_ATTEMPTS = 20;

/**
 * TZ transfer saga (one hold on sender):
 *   lockFx → assertSenderCanPay → placeHold(amountFrom) → capture → credit(amountTo) → Completed
 *
 * Cross-currency: hold/capture/refund in from currency; credit in toCurrency at locked fxRate.
 */
@Injectable()
export class SagaService {
	private readonly logger = new Logger(SagaService.name);

	constructor(
		private readonly transfer: TransferStore,
		private readonly ledger: LedgerClient,
		private readonly fx: FxService,
		private readonly outbox: OutboxService,
	) {}

	async executeTransfer(ctx: TransferSagaContext): Promise<void> {
		this.assertContext(ctx);

		let holdId: string | null = null;

		await this.emit(TRANSFER_OUTBOX_EVENT.Started, ctx, {
			status: 'Pending',
			currentStep: 'start',
		});

		const fxLocked = await this.lockFx(ctx);
		if (!fxLocked.ok) {
			await this.fail(ctx, 'lockFx', fxLocked.reason);
			return;
		}
		ctx = fxLocked.ctx;

		if (!(await this.assertSenderCanPay(ctx))) {
			await this.fail(ctx, 'assertSenderCanPay', 'insufficient_funds');
			return;
		}

		const holdResult = await this.placeHold(ctx);
		if (!holdResult.ok) {
			await this.fail(ctx, 'placeHold', 'place_hold_failed');
			return;
		}
		holdId = holdResult.holdId;

		if (!(await this.captureHold(ctx, holdId))) {
			await this.cancelCapture(ctx, holdId);
			return;
		}

		const creditResult = await this.creditRecipient(ctx);
		if (!creditResult.ok) {
			await this.cancelCreditAfterCapture(ctx, holdId);
			return;
		}

		await this.complete(ctx);
	}

	async retryDueCompensations(): Promise<number> {
		const due = await this.transfer.findDueCompensations();
		for (const row of due) {
			await this.resumeCompensation(row);
		}
		return due.length;
	}

	async resumeCompensation(row: TransferRecord): Promise<void> {
		if (row.status !== 'Compensating' || !row.compensationAction) {
			return;
		}
		if (row.attempts >= COMPENSATION_MAX_ATTEMPTS) {
			this.logger.error(
				`Compensation exhausted transfer=${row.id} action=${row.compensationAction} attempts=${row.attempts}`,
			);
			await this.transfer.update({
				where: { id: row.id },
				data: {
					failureReason: `compensation_exhausted:${row.compensationAction}`,
					nextRetryAt: null,
				},
			});
			return;
		}

		const ctx = this.rowToContext(row);

		if (row.compensationAction === 'releaseHold') {
			const outcome = await this.reconcileReleaseOrCaptured(ctx, row.holdId);
			if (outcome === 'released') {
				await this.failConsistent(ctx, 'releaseHold', row.holdId);
				return;
			}
			if (outcome === 'already_captured') {
				await this.setStatus(ctx.transferId, 'Held', {
					currentStep: 'captureHold',
					holdId: row.holdId,
					compensationAction: null,
					failureReason: null,
					nextRetryAt: null,
				});
				await this.emit(TRANSFER_OUTBOX_EVENT.Captured, ctx, {
					status: 'Held',
					currentStep: 'captureHold',
					holdId: row.holdId,
				});
				const creditResult = await this.creditRecipient(ctx);
				if (!creditResult.ok) {
					await this.cancelCreditAfterCapture(ctx, row.holdId!);
					return;
				}
				await this.complete(ctx);
				return;
			}
			await this.scheduleCompensationRetry(row.id, 'releaseHold', row.holdId, row.attempts);
			return;
		}

		const refunded = await this.tryRefundSender(ctx);
		if (refunded) {
			await this.failConsistent(ctx, 'refundSender', row.holdId);
			return;
		}
		await this.scheduleCompensationRetry(row.id, 'refundSender', row.holdId, row.attempts);
	}

	private assertContext(ctx: TransferSagaContext): void {
		if (!ctx?.transferId) {
			throw new Error('Saga context.transferId is required');
		}
		if (!ctx.fromWalletId) {
			throw new Error('Saga context.fromWalletId is required');
		}
		if (!ctx.toWalletIdentifier) {
			throw new Error('Saga context.toWalletIdentifier is required');
		}
		if (!(ctx.amount > 0)) {
			throw new Error('Saga context.amount must be positive');
		}
		if (!ctx.currency) {
			throw new Error('Saga context.currency is required');
		}
		if (!ctx.toCurrency) {
			throw new Error('Saga context.toCurrency is required');
		}
		if (!ctx.idempotencyKey) {
			throw new Error('Saga context.idempotencyKey is required');
		}
	}

	private cmd(ctx: TransferSagaContext, step: string): string {
		return `${ctx.idempotencyKey}:${step}`;
	}

	private rowToContext(row: TransferRecord): TransferSagaContext {
		return {
			transferId: row.id,
			idempotencyKey: row.idempotencyKey,
			fromWalletId: row.fromWalletId,
			toWalletIdentifier: row.toIdentifier,
			amount: row.amount,
			currency: row.currency,
			toCurrency: row.toCurrency,
			amountTo: row.amountTo,
			fxRate: row.fxRate,
		};
	}

	/**
	 * Resolve recipient currency via ledger, then lock FX for the saga lifetime.
	 * Frontend must NOT send toCurrency — only destination identifier.
	 */
	private async lockFx(
		ctx: TransferSagaContext,
	): Promise<{ ok: true; ctx: TransferSagaContext } | { ok: false; reason: string }> {
		await this.setStatus(ctx.transferId, 'Pending', { currentStep: 'lockFx' });
		try {
			const dest = await this.ledger.resolveDestination(
				ctx.toWalletIdentifier,
				ctx.currency,
			);
			const toCurrency = dest.currency.toUpperCase();
			const quote = this.fx.quote(ctx.currency, toCurrency);
			if (quote.stale) {
				return { ok: false, reason: 'fx_rate_stale' };
			}
			const amountTo = this.fx.convert(ctx.amount, quote.rate);
			if (!(amountTo > 0)) {
				return { ok: false, reason: 'fx_amount_too_small' };
			}
			const next: TransferSagaContext = {
				...ctx,
				fxRate: quote.rate,
				amountTo,
				toCurrency,
				currency: quote.from,
			};
			await this.transfer.update({
				where: { id: ctx.transferId },
				data: {
					fxRate: next.fxRate,
					amountTo: next.amountTo,
					toCurrency: next.toCurrency,
					currency: next.currency,
					toWalletId: dest.walletId,
					currentStep: 'lockFx',
				},
			});
			this.logger.log(
				`FX locked transfer=${ctx.transferId} ${next.amount} ${next.currency} → ${next.amountTo} ${next.toCurrency} @ ${next.fxRate} destWallet=${dest.walletId ?? 'pending-create'}`,
			);
			return { ok: true, ctx: next };
		} catch (err) {
			this.logger.error(`lockFx failed: ${this.errMsg(err)}`);
			if (err instanceof LedgerHttpError && err.status === 404) {
				return { ok: false, reason: 'recipient_not_found' };
			}
			return { ok: false, reason: 'fx_unavailable' };
		}
	}

	private async setStatus(
		transferId: string,
		status: TransferStatus,
		patch: {
			currentStep?: string | null;
			failureReason?: string | null;
			holdId?: string | null;
			toWalletId?: string | null;
			compensationAction?: CompensationAction | null;
			attempts?: number;
			nextRetryAt?: Date | null;
		} = {},
	): Promise<void> {
		await this.transfer.update({
			where: { id: transferId },
			data: {
				status,
				...(patch.currentStep !== undefined ? { currentStep: patch.currentStep } : {}),
				...(patch.failureReason !== undefined
					? { failureReason: patch.failureReason }
					: {}),
				...(patch.holdId !== undefined ? { holdId: patch.holdId } : {}),
				...(patch.toWalletId !== undefined ? { toWalletId: patch.toWalletId } : {}),
				...(patch.compensationAction !== undefined
					? { compensationAction: patch.compensationAction }
					: {}),
				...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
				...(patch.nextRetryAt !== undefined ? { nextRetryAt: patch.nextRetryAt } : {}),
			},
		});
	}

	/**
	 * Pre-check only. Ledger.placeHold is the authoritative funds check
	 * (atomic lock + available >= amount inside the ledger transaction).
	 */
	private async assertSenderCanPay(ctx: TransferSagaContext): Promise<boolean> {
		await this.setStatus(ctx.transferId, 'Pending', {
			currentStep: 'assertSenderCanPay',
			compensationAction: null,
			nextRetryAt: null,
		});
		await this.emit(TRANSFER_OUTBOX_EVENT.BalanceChecked, ctx, {
			status: 'Pending',
			currentStep: 'assertSenderCanPay',
		});

		try {
			const wallet = await this.ledger.getWallet(ctx.fromWalletId);
			if (wallet.currency.toUpperCase() !== ctx.currency.toUpperCase()) {
				this.logger.warn(
					`Currency mismatch transfer=${ctx.transferId} wallet=${wallet.currency} tx=${ctx.currency}`,
				);
				return false;
			}
			if (Number(wallet.available) < ctx.amount) {
				this.logger.warn(
					`Insufficient funds transfer=${ctx.transferId} available=${wallet.available} need=${ctx.amount}`,
				);
				return false;
			}
			return true;
		} catch (err) {
			this.logger.error(`assertSenderCanPay failed: ${this.errMsg(err)}`);
			return false;
		}
	}

	private async placeHold(
		ctx: TransferSagaContext,
	): Promise<{ ok: true; holdId: string } | { ok: false }> {
		await this.setStatus(ctx.transferId, 'Held', { currentStep: 'placeHold' });

		try {
			const hold = await this.ledger.placeHold({
				walletId: ctx.fromWalletId,
				amount: ctx.amount,
				currency: ctx.currency,
				sagaId: ctx.transferId,
				commandId: this.cmd(ctx, 'placeHold'),
			});
			await this.setStatus(ctx.transferId, 'Held', {
				currentStep: 'placeHold',
				holdId: hold.id,
			});
			return { ok: true, holdId: hold.id };
		} catch (err) {
			this.logger.error(`placeHold failed: ${this.errMsg(err)}`);
			return { ok: false };
		}
	}

	private async captureHold(ctx: TransferSagaContext, holdId: string): Promise<boolean> {
		await this.setStatus(ctx.transferId, 'Held', { currentStep: 'captureHold', holdId });
		const commandId = this.cmd(ctx, 'captureHold');

		const ok = await this.tryCaptureHold(ctx, holdId, commandId);
		if (ok) {
			await this.emit(TRANSFER_OUTBOX_EVENT.Captured, ctx, {
				status: 'Held',
				currentStep: 'captureHold',
				holdId,
			});
		}
		return ok;
	}

	private async tryCaptureHold(
		ctx: TransferSagaContext,
		holdId: string,
		commandId: string,
	): Promise<boolean> {
		try {
			await this.ledger.captureHold(holdId, commandId, ctx.transferId);
			return true;
		} catch (err) {
			this.logger.error(`captureHold failed: ${this.errMsg(err)}`);
		}

		try {
			await this.ledger.captureHold(holdId, commandId, ctx.transferId);
			return true;
		} catch (err) {
			this.logger.error(`captureHold retry failed: ${this.errMsg(err)}`);
		}

		try {
			const hold = await this.ledger.getHold(holdId);
			if (hold.status === 'captured') {
				this.logger.warn(
					`captureHold reconciled as success transfer=${ctx.transferId} hold=${holdId}`,
				);
				return true;
			}
		} catch (err) {
			this.logger.error(`getHold during capture reconcile failed: ${this.errMsg(err)}`);
		}

		return false;
	}

	private async creditRecipient(
		ctx: TransferSagaContext,
	): Promise<{ ok: true; walletId: string } | { ok: false }> {
		await this.setStatus(ctx.transferId, 'Credited', { currentStep: 'creditRecipient' });

		try {
			const row = await this.transfer.findUnique({ where: { id: ctx.transferId } });
			const result = await this.ledger.credit({
				...(row?.toWalletId
					? { toWalletId: row.toWalletId }
					: { toIdentifier: ctx.toWalletIdentifier }),
				amount: ctx.amountTo,
				currency: ctx.toCurrency,
				sagaId: ctx.transferId,
				commandId: this.cmd(ctx, 'credit'),
			});
			await this.setStatus(ctx.transferId, 'Credited', {
				currentStep: 'creditRecipient',
				toWalletId: result.walletId,
			});
			await this.emit(TRANSFER_OUTBOX_EVENT.Credited, ctx, {
				status: 'Credited',
				currentStep: 'creditRecipient',
				toWalletId: result.walletId,
				holdId: row?.holdId ?? null,
			});
			return { ok: true, walletId: result.walletId };
		} catch (err) {
			this.logger.error(`credit failed: ${this.errMsg(err)}`);
			return { ok: false };
		}
	}

	private async complete(ctx: TransferSagaContext): Promise<void> {
		await this.setStatus(ctx.transferId, 'Completed', {
			currentStep: 'complete',
			failureReason: null,
			compensationAction: null,
			nextRetryAt: null,
		});
		await this.emit(TRANSFER_OUTBOX_EVENT.Completed, ctx, {
			status: 'Completed',
			currentStep: 'complete',
		});
	}

	/** Business failure with consistent money (no open ledger debt). */
	private async fail(
		ctx: TransferSagaContext,
		step: string,
		failureReason: string,
		holdId?: string | null,
	): Promise<void> {
		await this.setStatus(ctx.transferId, 'Failed', {
			currentStep: step,
			failureReason,
			compensationAction: null,
			nextRetryAt: null,
			...(holdId !== undefined ? { holdId } : {}),
		});
		await this.emit(TRANSFER_OUTBOX_EVENT.Failed, ctx, {
			status: 'Failed',
			currentStep: step,
			holdId: holdId ?? null,
			failureReason,
		});
	}

	private async emit(
		type: (typeof TRANSFER_OUTBOX_EVENT)[keyof typeof TRANSFER_OUTBOX_EVENT],
		ctx: TransferSagaContext,
		extra: {
			status: string;
			currentStep?: string | null;
			holdId?: string | null;
			toWalletId?: string | null;
			failureReason?: string | null;
		},
	): Promise<void> {
		try {
			await this.outbox.enqueueTransferEvent(type, ctx, extra);
		} catch (err) {
			this.logger.error(`outbox enqueue ${type} failed: ${this.errMsg(err)}`);
		}
	}

	private async failConsistent(
		ctx: TransferSagaContext,
		action: CompensationAction,
		holdId: string | null,
	): Promise<void> {
		const reason =
			action === 'releaseHold' ? 'capture_failed_hold_released' : 'credit_failed_refunded';
		await this.fail(ctx, `compensated:${action}`, reason, holdId);
	}

	private async cancelCapture(ctx: TransferSagaContext, holdId: string): Promise<void> {
		// Last chance reconcile before compensating.
		try {
			const hold = await this.ledger.getHold(holdId);
			if (hold.status === 'captured') {
				this.logger.warn(
					`cancelCapture aborted — hold already captured transfer=${ctx.transferId}`,
				);
				await this.emit(TRANSFER_OUTBOX_EVENT.Captured, ctx, {
					status: 'Held',
					currentStep: 'captureHold',
					holdId,
				});
				const creditResult = await this.creditRecipient(ctx);
				if (!creditResult.ok) {
					await this.cancelCreditAfterCapture(ctx, holdId);
					return;
				}
				await this.complete(ctx);
				return;
			}
		} catch (err) {
			this.logger.error(`cancelCapture reconcile failed: ${this.errMsg(err)}`);
		}

		await this.setStatus(ctx.transferId, 'Compensating', {
			currentStep: 'releaseHold',
			holdId,
			compensationAction: 'releaseHold',
			failureReason: 'capture_failed_awaiting_release',
			attempts: 0,
		});

		const outcome = await this.reconcileReleaseOrCaptured(ctx, holdId);
		if (outcome === 'released') {
			await this.failConsistent(ctx, 'releaseHold', holdId);
			return;
		}
		if (outcome === 'already_captured') {
			const creditResult = await this.creditRecipient(ctx);
			if (!creditResult.ok) {
				await this.cancelCreditAfterCapture(ctx, holdId);
				return;
			}
			await this.complete(ctx);
			return;
		}

		await this.scheduleCompensationRetry(ctx.transferId, 'releaseHold', holdId, 0);
	}

	/**
	 * Try release; if hold is already captured, return already_captured
	 * (capture succeeded earlier — must continue to credit, not Failed).
	 */
	private async reconcileReleaseOrCaptured(
		ctx: TransferSagaContext,
		holdId: string | null,
	): Promise<'released' | 'already_captured' | 'retry'> {
		if (!holdId) {
			this.logger.error(`releaseHold missing holdId transfer=${ctx.transferId}`);
			return 'retry';
		}

		try {
			const hold = await this.ledger.getHold(holdId);
			if (hold.status === 'captured') {
				return 'already_captured';
			}
			if (hold.status === 'released') {
				return 'released';
			}
		} catch (err) {
			this.logger.error(`getHold before release failed: ${this.errMsg(err)}`);
		}

		try {
			await this.ledger.releaseHold(holdId, this.cmd(ctx, 'releaseHold'), ctx.transferId);
			return 'released';
		} catch (err) {
			this.logger.error(`releaseHold failed: ${this.errMsg(err)}`);
			try {
				const hold = await this.ledger.getHold(holdId);
				if (hold.status === 'captured') return 'already_captured';
				if (hold.status === 'released') return 'released';
			} catch (e2) {
				this.logger.error(`getHold after release fail: ${this.errMsg(e2)}`);
			}
			return 'retry';
		}
	}

	private async cancelCreditAfterCapture(
		ctx: TransferSagaContext,
		holdId: string,
	): Promise<void> {
		await this.setStatus(ctx.transferId, 'Compensating', {
			currentStep: 'refundSender',
			holdId,
			compensationAction: 'refundSender',
			failureReason: 'credit_failed_awaiting_refund',
			attempts: 0,
		});

		const ok = await this.tryRefundSender(ctx);
		if (ok) {
			await this.failConsistent(ctx, 'refundSender', holdId);
			return;
		}

		await this.scheduleCompensationRetry(ctx.transferId, 'refundSender', holdId, 0);
	}

	private async tryRefundSender(ctx: TransferSagaContext): Promise<boolean> {
		try {
			await this.ledger.credit({
				toWalletId: ctx.fromWalletId,
				amount: ctx.amount,
				currency: ctx.currency,
				sagaId: ctx.transferId,
				commandId: this.cmd(ctx, 'refundSender'),
			});
			return true;
		} catch (err) {
			this.logger.error(`refundSender failed: ${this.errMsg(err)}`);
			return false;
		}
	}

	private async scheduleCompensationRetry(
		transferId: string,
		action: CompensationAction,
		holdId: string | null,
		prevAttempts: number,
	): Promise<void> {
		const attempts = prevAttempts + 1;
		const nextRetryAt = new Date(Date.now() + COMPENSATION_BACKOFF_MS * attempts);
		this.logger.warn(
			`Compensation pending retry transfer=${transferId} action=${action} attempt=${attempts} next=${nextRetryAt.toISOString()}`,
		);
		await this.setStatus(transferId, 'Compensating', {
			currentStep: action,
			holdId,
			compensationAction: action,
			failureReason:
				action === 'releaseHold'
					? 'capture_failed_awaiting_release'
					: 'credit_failed_awaiting_refund',
			attempts,
			nextRetryAt,
		});
	}

	private errMsg(err: unknown): string {
		if (err instanceof LedgerHttpError) {
			return `${err.message} (status=${err.status})`;
		}
		return err instanceof Error ? err.message : String(err);
	}
}
