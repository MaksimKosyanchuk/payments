export type DomainEvent = {
	eventId: string;
	type: string;
	payload: Record<string, unknown>;
	correlationId: string | null;
	occurredAt: string | null;
	schemaVersion: string | null;
	/** Redis stream entry id (for XACK). */
	streamId: string;
	stream: string;
};

export type TransferEventPayload = {
	transferId?: string;
	status?: string;
	currentStep?: string | null;
	fromWalletId?: string;
	toWalletId?: string | null;
	toIdentifier?: string;
	amount?: number;
	currency?: string;
	amountTo?: number;
	toCurrency?: string;
	fxRate?: number;
	holdId?: string | null;
	failureReason?: string | null;
	initiatorId?: string;
	recipientOwnerId?: string | null;
	userId?: string;
};

/** Events that should refresh payment history UIs. */
export const HISTORY_TRANSFER_TYPES = new Set([
	'TransferCaptured',
	'TransferCredited',
	'TransferCompleted',
	'TransferFailed',
]);
