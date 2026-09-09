import { Logger } from '@nestjs/common';

/**
 * Simple consecutive-failure circuit for ledger HTTP calls.
 * Open → reject immediately until cooldown elapses.
 * Callers can pass `{ trip: false }` to ignore business 4xx.
 */
export class CircuitBreaker {
	private readonly logger = new Logger(CircuitBreaker.name);
	private failures = 0;
	private openedAt: number | null = null;

	constructor(
		private readonly failureThreshold = 5,
		private readonly cooldownMs = 30_000,
		private readonly name = 'ledger',
	) {}

	async exec<T>(fn: () => Promise<T>, opts?: { trip?: boolean }): Promise<T> {
		if (this.isOpen()) {
			const remaining = this.openedAt
				? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt))
				: this.cooldownMs;
			throw new Error(`Circuit open (${this.name}); retry in ~${Math.ceil(remaining / 1000)}s`);
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			const noTrip =
				opts?.trip === false ||
				(typeof err === 'object' && err !== null && '__noTrip' in err);
			if (!noTrip) this.onFailure();
			throw err;
		}
	}

	private isOpen(): boolean {
		if (this.openedAt == null) return false;
		if (Date.now() - this.openedAt >= this.cooldownMs) {
			this.logger.warn(`Circuit half-open (${this.name}) — allowing probe`);
			this.openedAt = null;
			this.failures = 0;
			return false;
		}
		return true;
	}

	private onSuccess(): void {
		this.failures = 0;
		this.openedAt = null;
	}

	private onFailure(): void {
		this.failures += 1;
		if (this.failures >= this.failureThreshold && this.openedAt == null) {
			this.openedAt = Date.now();
			this.logger.error(
				`Circuit open (${this.name}) after ${this.failures} failures; cooldown ${this.cooldownMs}ms`,
			);
		}
	}
}
