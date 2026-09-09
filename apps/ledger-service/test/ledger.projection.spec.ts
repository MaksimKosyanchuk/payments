import { LEDGER_EVENT } from '../src/wallets/ledger.events';
import { rebuildProjectionFromEvents } from '../src/wallets/ledger.projection';

describe('ledger.projection', () => {
	it('rebuilds available/held from event stream', () => {
		const rebuilt = rebuildProjectionFromEvents([
			{ type: LEDGER_EVENT.WalletOpened, payload: { currency: 'USD' } },
			{ type: LEDGER_EVENT.MoneyDeposited, payload: { amount: 100 } },
			{ type: LEDGER_EVENT.HoldPlaced, payload: { amount: 40 } },
			{ type: LEDGER_EVENT.HoldCaptured, payload: { amount: 40 } },
		]);

		expect(rebuilt.available).toBe(60);
		expect(rebuilt.held).toBe(0);
	});

	it('release returns funds to available', () => {
		const rebuilt = rebuildProjectionFromEvents([
			{ type: LEDGER_EVENT.WalletOpened, payload: {} },
			{ type: LEDGER_EVENT.MoneyDeposited, payload: { amount: 50 } },
			{ type: LEDGER_EVENT.HoldPlaced, payload: { amount: 20 } },
			{ type: LEDGER_EVENT.HoldReleased, payload: { amount: 20 } },
		]);
		expect(rebuilt.available).toBe(50);
		expect(rebuilt.held).toBe(0);
	});
});
