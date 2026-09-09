import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FxCurrency = 'USD' | 'EUR' | 'UAH';

export interface FxQuote {
	from: FxCurrency;
	to: FxCurrency;
	rate: number;
	asOf: Date;
	stale: boolean;
}

/**
 * Simple cached FX for TZ: a few currencies, TTL, no full fx-service.
 * Rates are vs USD mid; pair rate = usd[to] / usd[from] inverted appropriately.
 */
@Injectable()
export class FxService {
	private readonly logger = new Logger(FxService.name);
	private readonly ttlMs: number;
	/** Units of currency per 1 USD. */
	private readonly perUsd: Record<FxCurrency, number> = {
		USD: 1,
		EUR: 0.92,
		UAH: 41.0,
	};
	private asOf = new Date();

	constructor(config: ConfigService) {
		this.ttlMs = Number(config.get('FX_RATE_TTL_MS') ?? 5 * 60_000);
	}

	/** Refresh table (tests / admin). */
	setRates(rates: Partial<Record<FxCurrency, number>>, asOf = new Date()): void {
		Object.assign(this.perUsd, rates);
		this.asOf = asOf;
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
		// from → USD → to
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
