import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityService } from './activity.service';

@Controller('activity')
@ApiTags('activity')
@ApiBearerAuth()
export class ActivityController {
	constructor(private readonly activity: ActivityService) {}

	/** Snapshot for reconnect — only the authenticated user's feed. */
	@Get('me')
	@UseGuards(JwtAuthGuard)
	@ApiOperation({ summary: 'Get the authenticated user activity snapshot' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: '1..100 items' })
	@ApiResponse({ status: 200, description: 'Activity items for reconnect or history view' })
	@ApiResponse({ status: 401, description: 'Authentication required' })
	list(@Request() req: AuthedRequest, @Query('limit') limit?: string) {
		const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
		return this.activity.listForUser(req.user.userId, take);
	}
}
