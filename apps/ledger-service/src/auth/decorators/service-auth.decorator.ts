import { applyDecorators, UseGuards } from '@nestjs/common';
import { ServiceAuthGuard } from '../guards/service-auth.guard';

/**
 * Marks a route as service-to-service only (payments → ledger).
 * Requires header `x-service-key: <LEDGER_SERVICE_API_KEY>`.
 */
export function ServiceAuth() {
	return applyDecorators(UseGuards(ServiceAuthGuard));
}
