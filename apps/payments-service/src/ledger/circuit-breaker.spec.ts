import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
	it('opens after consecutive failures and rejects until cooldown', async () => {
		const breaker = new CircuitBreaker(2, 50, 'test');

		await expect(
			breaker.exec(async () => {
				throw new Error('fail1');
			}),
		).rejects.toThrow('fail1');
		await expect(
			breaker.exec(async () => {
				throw new Error('fail2');
			}),
		).rejects.toThrow('fail2');

		await expect(breaker.exec(async () => 'ok')).rejects.toThrow(/Circuit open/);

		await new Promise((r) => setTimeout(r, 60));
		await expect(breaker.exec(async () => 'ok')).resolves.toBe('ok');
	});

	it('does not trip on __noTrip errors', async () => {
		const breaker = new CircuitBreaker(1, 30_000, 'test');
		const soft = Object.assign(new Error('business'), { __noTrip: true });

		await expect(
			breaker.exec(async () => {
				throw soft;
			}),
		).rejects.toThrow('business');

		await expect(breaker.exec(async () => 'ok')).resolves.toBe('ok');
	});
});
