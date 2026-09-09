import { Controller, Get } from '@nestjs/common';
import { FxRatesPayload, MOCK_FX_RATES } from './fx.rates';

/**
 * Mock FX provider — returns constant table with a fresh asOf.
 * Payments polls this (or an external URL) every FX_REFRESH_MS.
 */
@Controller('fx')
export class FxMockController {
	@Get('rates')
	rates(): FxRatesPayload {
		return {
			asOf: new Date().toISOString(),
			rates: { ...MOCK_FX_RATES },
		};
	}
}
