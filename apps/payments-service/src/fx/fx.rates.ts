import { FxCurrency } from './fx.service';

/** Mock mid rates: units of currency per 1 USD. */
export const MOCK_FX_RATES: Record<FxCurrency, number> = {
	USD: 1,
	EUR: 0.92,
	UAH: 41.0,
};

export type FxRatesPayload = {
	asOf: string;
	rates: Record<FxCurrency, number>;
};
