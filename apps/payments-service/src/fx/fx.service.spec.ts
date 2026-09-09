import { FxService } from './fx.service';

describe('FxService', () => {
	const fx = new FxService({ get: () => '60000' } as never);

	it('same currency rate is 1', () => {
		const q = fx.quote('USD', 'USD');
		expect(q.rate).toBe(1);
		expect(q.stale).toBe(false);
		expect(fx.convert(50, q.rate)).toBe(50);
	});

	it('converts USD to EUR via table', () => {
		fx.setRates({ USD: 1, EUR: 0.5, UAH: 40 }, new Date());
		const q = fx.quote('USD', 'EUR');
		expect(q.rate).toBe(0.5);
		expect(fx.convert(100, q.rate)).toBe(50);
	});

	it('marks quote stale after TTL', () => {
		fx.setRates({ USD: 1, EUR: 0.92, UAH: 41 }, new Date(Date.now() - 120_000));
		const shortTtl = new FxService({ get: () => '1000' } as never);
		shortTtl.setRates({ USD: 1, EUR: 0.92, UAH: 41 }, new Date(Date.now() - 5000));
		expect(shortTtl.quote('USD', 'EUR').stale).toBe(true);
	});
});
