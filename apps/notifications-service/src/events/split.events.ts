/** Split-bill domain events from payments outbox. */
export const SPLIT_EVENT = {
	BillCreated: 'SplitBillCreated',
	SharePaid: 'SplitSharePaid',
	ShareOverdue: 'SplitShareOverdue',
	BillSettled: 'SplitBillSettled',
} as const;

export type SplitEventType = (typeof SPLIT_EVENT)[keyof typeof SPLIT_EVENT];

export function isSplitEvent(type: string): type is SplitEventType {
	return Object.values(SPLIT_EVENT).includes(type as SplitEventType);
}
