import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('health')
export class HealthController {
	@Get()
	@ApiOperation({ summary: 'Check service health' })
	@ApiResponse({ status: 200, description: 'Service is healthy' })
	check() {
		return { status: 'ok', service: 'notifications-service' };
	}
}
