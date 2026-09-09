import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MOCK_FX_RATES } from './fx.rates';

export type FxCurrency = 'USD' | 'EUR' | 'UAH';

export interface FxQuote {
	from: FxCurrency;
	to: FxCurrency;
	rate: number;
	asOf: Date;
	stale: boolean;
}

/**
 * Cached FX table. Refreshed by FxRefreshWorker via HTTP mock every ~10s.
 * Rates are units of currency per 1 USD.
 */
@Injectable()
export class FxService {
	private readonly logger = new Logger(FxService.name);
	private readonly ttlMs: number;
	private readonly perUsd: Record<FxCurrency, number> = { ...MOCK_FX_RATES };
	private asOf = new Date();

	constructor(config: ConfigService) {
		// Default TTL 60s — refresh is every 10s, so a missed poll still ok.
		this.ttlMs = Number(config.get('FX_RATE_TTL_MS') ?? 60_000);
	}

	/** Apply rates from mock / provider. */
	setRates(rates: Partial<Record<FxCurrency, number>>, asOf = new Date()): void {
		Object.assign(this.perUsd, rates);
		this.asOf = asOf;
	}

	getSnapshot(): { asOf: Date; rates: Record<FxCurrency, number>; ttlMs: number } {
		return { asOf: this.asOf, rates: { ...this.perUsd }, ttlMs: this.ttlMs };
	}

	quote(fromRaw: string, toRaw: string): FxQuote {
		const from = fromRaw.toUpperCase() as FxCurrency;
		const to = toRaw.toUpperCase() as FxCurrency;
		if (!(from in this.perUsd) || !(to in this.perUsd)) {
			throw new Error(`Unsupported FX pair ${from}/${to}`);
		}
		if (from === to) {
			return { from, to, rate: 1, asOf: this.asOf, stale: false };
		}
		const rate = this.roundRate(this.perUsd[to] / this.perUsd[from]);
		const age = Date.now() - this.asOf.getTime();
		const stale = age > this.ttlMs;
		if (stale) {
			this.logger.warn(`FX quote stale ${from}->${to} ageMs=${age} ttlMs=${this.ttlMs}`);
		}
		return { from, to, rate, asOf: this.asOf, stale };
	}

	convert(amountFrom: number, rate: number): number {
		return Math.round(amountFrom * rate * 100) / 100;
	}

	private roundRate(rate: number): number {
		return Math.round(rate * 1e8) / 1e8;
	}
}
