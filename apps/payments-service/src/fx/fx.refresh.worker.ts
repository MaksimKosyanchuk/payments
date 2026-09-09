import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { FxRatesClient } from './fx.rates.client';
import { FxService } from './fx.service';

@Injectable()
export class FxRefreshWorker implements OnModuleInit {
	private readonly logger = new Logger(FxRefreshWorker.name);
	private readonly enabled: boolean;
	private refreshing = false;

	constructor(
		private readonly client: FxRatesClient,
		private readonly fx: FxService,
		config: ConfigService,
	) {
		this.enabled = (config.get<string>('FX_REFRESH_ENABLED') ?? 'true') !== 'false';
	}

	async onModuleInit(): Promise<void> {
		if (!this.enabled) {
			this.logger.warn('FX refresh disabled');
			return;
		}
		// Delay so HTTP server is listening for self-mock URL.
		setTimeout(() => {
			void this.refresh();
		}, 1500);
	}

	/** Every 10s — keep cache asOf fresh so quotes are not stale. */
	@Interval(10_000)
	async tick(): Promise<void> {
		if (!this.enabled) {
			return;
		}
		await this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.refreshing) {
			return;
		}
		this.refreshing = true;
		try {
			const payload = await this.client.fetchRates();
			this.fx.setRates(payload.rates, new Date(payload.asOf));
			this.logger.debug(
				`FX rates refreshed asOf=${payload.asOf} EUR=${payload.rates.EUR} UAH=${payload.rates.UAH}`,
			);
		} catch (err) {
			this.logger.error(
				`FX refresh failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			this.refreshing = false;
		}
	}
}
