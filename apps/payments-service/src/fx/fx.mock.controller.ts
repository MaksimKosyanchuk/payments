import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FxRatesPayload, MOCK_FX_RATES } from './fx.rates';

/**
 * Mock FX provider — returns constant table with a fresh asOf.
 * Payments polls this (or an external URL) every FX_REFRESH_MS.
 */
@Controller('fx')
@ApiTags('fx')
export class FxMockController {
	@Get('rates')
	@ApiOperation({ summary: 'Get the current mock FX table' })
	@ApiResponse({ status: 200, description: 'Rates and their timestamp' })
	rates(): FxRatesPayload {
		return {
			asOf: new Date().toISOString(),
			rates: { ...MOCK_FX_RATES },
		};
	}
}
