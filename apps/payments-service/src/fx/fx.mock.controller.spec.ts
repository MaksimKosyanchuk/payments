import { FxMockController } from './fx.mock.controller';
import { MOCK_FX_RATES } from './fx.rates';

describe('FxMockController', () => {
	it('returns constant rates with fresh asOf', () => {
		const ctrl = new FxMockController();
		const before = Date.now();
		const body = ctrl.rates();
		expect(body.rates).toEqual(MOCK_FX_RATES);
		expect(new Date(body.asOf).getTime()).toBeGreaterThanOrEqual(before - 1000);
	});
});
