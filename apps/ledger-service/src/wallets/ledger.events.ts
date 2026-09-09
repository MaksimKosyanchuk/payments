export const LEDGER_EVENT = {
	WalletOpened: 'WalletOpened',
	MoneyDeposited: 'MoneyDeposited',
	MoneyWithdrawn: 'MoneyWithdrawn',
	HoldPlaced: 'HoldPlaced',
	HoldReleased: 'HoldReleased',
	HoldCaptured: 'HoldCaptured',
	MoneyCredited: 'MoneyCredited',
	MoneyDebited: 'MoneyDebited',
} as const;

export type LedgerEventType = (typeof LEDGER_EVENT)[keyof typeof LEDGER_EVENT];

export function walletStreamId(walletId: string): string {
	return `wallet:${walletId}`;
}
