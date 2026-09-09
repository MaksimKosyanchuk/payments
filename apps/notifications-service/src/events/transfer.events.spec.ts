import { isTransferEvent, TRANSFER_EVENT } from './transfer.events';

describe('transfer.events', () => {
	it('recognizes payments outbox types', () => {
		expect(isTransferEvent(TRANSFER_EVENT.Started)).toBe(true);
		expect(isTransferEvent(TRANSFER_EVENT.BalanceChecked)).toBe(true);
		expect(isTransferEvent(TRANSFER_EVENT.Captured)).toBe(true);
		expect(isTransferEvent(TRANSFER_EVENT.Credited)).toBe(true);
		expect(isTransferEvent(TRANSFER_EVENT.Completed)).toBe(true);
		expect(isTransferEvent(TRANSFER_EVENT.Failed)).toBe(true);
		expect(isTransferEvent('WalletCredited')).toBe(false);
	});
});
