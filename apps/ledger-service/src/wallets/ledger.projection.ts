import { LEDGER_EVENT, LedgerEventType } from './ledger.events';

export interface BalanceProjection {
	available: number;
	held: number;
}

/** Pure projection fold — used by runtime updates and reconciliation rebuild. */
export function applyEventToProjection(
	balance: BalanceProjection,
	type: LedgerEventType | string,
	payload: Record<string, unknown>,
): BalanceProjection {
	const amount = Number(payload.amount ?? 0);
	let available = balance.available;
	let held = balance.held;

	switch (type) {
		case LEDGER_EVENT.WalletOpened:
			available = 0;
			held = 0;
			break;
		case LEDGER_EVENT.MoneyDeposited:
		case LEDGER_EVENT.MoneyCredited:
			available += amount;
			break;
		case LEDGER_EVENT.MoneyWithdrawn:
		case LEDGER_EVENT.MoneyDebited:
			available -= amount;
			break;
		case LEDGER_EVENT.HoldPlaced:
			available -= amount;
			held += amount;
			break;
		case LEDGER_EVENT.HoldReleased:
			held -= amount;
			available += amount;
			break;
		case LEDGER_EVENT.HoldCaptured:
			held -= amount;
			break;
		default:
			break;
	}

	return { available, held };
}

export function rebuildProjectionFromEvents(
	events: Array<{ type: string; payload: Record<string, unknown> }>,
): BalanceProjection {
	return events.reduce<BalanceProjection>(
		(acc, ev) => applyEventToProjection(acc, ev.type, ev.payload),
		{ available: 0, held: 0 },
	);
}
