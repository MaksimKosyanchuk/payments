import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
	constructor(private readonly activity: ActivityService) {}

	/** Snapshot for reconnect — only the authenticated user's feed. */
	@Get('me')
	@UseGuards(JwtAuthGuard)
	list(@Request() req: AuthedRequest, @Query('limit') limit?: string) {
		const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
		return this.activity.listForUser(req.user.userId, take);
	}
}
