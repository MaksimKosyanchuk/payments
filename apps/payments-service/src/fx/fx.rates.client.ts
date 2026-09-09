import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FxRatesPayload } from './fx.rates';

@Injectable()
export class FxRatesClient {
	private readonly logger = new Logger(FxRatesClient.name);
	private readonly url: string;

	constructor(config: ConfigService) {
		this.url =
			config.get<string>('FX_RATES_URL') ?? 'http://127.0.0.1:3002/fx/rates';
	}

	async fetchRates(): Promise<FxRatesPayload> {
		const res = await fetch(this.url, {
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`FX rates HTTP ${res.status}: ${body}`);
		}
		const json = (await res.json()) as FxRatesPayload;
		if (!json?.rates || typeof json.rates.USD !== 'number') {
			throw new Error('FX rates payload invalid');
		}
		return json;
	}
}
