export type TransferStatus =
	| 'Pending'
	| 'Held'
	| 'Credited'
	| 'Completed'
	| 'Compensating'
	| 'Failed';

/** Snapshot passed into the saga — enough to run steps without re-reading HTTP/DTO. */
export interface TransferSagaContext {
	transferId: string;
	idempotencyKey: string;
	fromWalletId: string;
	toWalletIdentifier: string;
	/** Amount debited from sender (fromCurrency). */
	amount: number;
	/** Sender / debit currency. */
	currency: string;
	/** Recipient credit currency (may differ → FX). */
	toCurrency: string;
	/** Credited amount in toCurrency (set after FX lock). */
	amountTo: number;
	/** Locked FX rate amountTo/amount; 1 for same currency. */
	fxRate: number;
	initiatorId?: string;
	/** Set after lockFx — destination wallet. */
	toWalletId?: string | null;
	/** Ledger owner of destination wallet (for recipient WS / activity). */
	recipientOwnerId?: string | null;
	/**
	 * Preferred recipient wallet currency (e.g. split bill currency).
	 * lockFx uses this as preferCurrency when resolving destination.
	 */
	creditCurrency?: string;
}

/** What compensation step must succeed before we may mark Failed. */
export type CompensationAction = 'releaseHold' | 'refundSender';

export interface TransferRecord {
	id: string;
	idempotencyKey: string;
	fromWalletId: string;
	toWalletId: string | null;
	toIdentifier: string;
	amount: number;
	currency: string;
	toCurrency: string;
	amountTo: number;
	fxRate: number;
	status: TransferStatus;
	currentStep: string | null;
	holdId: string | null;
	failureReason: string | null;
	/** Non-terminal Compensating: which ledger fix is still required. */
	compensationAction: CompensationAction | null;
	attempts: number;
	nextRetryAt: Date | null;
	initiatorId: string | null;
	createdAt: Date;
	updatedAt: Date;
}
