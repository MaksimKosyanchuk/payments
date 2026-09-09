export const SPLIT_OUTBOX_EVENT = {
	BillCreated: 'SplitBillCreated',
	SharePaid: 'SplitSharePaid',
	ShareOverdue: 'SplitShareOverdue',
	BillSettled: 'SplitBillSettled',
} as const;

export type SplitOutboxEventType =
	(typeof SPLIT_OUTBOX_EVENT)[keyof typeof SPLIT_OUTBOX_EVENT];
