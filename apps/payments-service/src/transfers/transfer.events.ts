export const TRANSFER_OUTBOX_EVENT = {
	/** UI: transfer accepted / sending started */
	Started: 'TransferStarted',
	/** UI: checking sender balance */
	BalanceChecked: 'TransferBalanceChecked',
	/** UI: money debited from sender (after capture) */
	Captured: 'TransferCaptured',
	/** UI: money credited to recipient */
	Credited: 'TransferCredited',
	/** UI: done */
	Completed: 'TransferCompleted',
	/** UI: rejected / failed */
	Failed: 'TransferFailed',
} as const;

export type TransferOutboxEventType =
	(typeof TRANSFER_OUTBOX_EVENT)[keyof typeof TRANSFER_OUTBOX_EVENT];
