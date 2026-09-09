/** Mirrors payments-service outbox types (UI progress steps). */
export const TRANSFER_EVENT = {
	Started: 'TransferStarted',
	BalanceChecked: 'TransferBalanceChecked',
	Captured: 'TransferCaptured',
	Credited: 'TransferCredited',
	Completed: 'TransferCompleted',
	Failed: 'TransferFailed',
} as const;

export type TransferEventType = (typeof TRANSFER_EVENT)[keyof typeof TRANSFER_EVENT];

export function isTransferEvent(type: string): type is TransferEventType {
	return Object.values(TRANSFER_EVENT).includes(type as TransferEventType);
}
