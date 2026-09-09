import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
	constructor(private readonly activity: ActivityService) {}

	/** Snapshot for reconnect — auth/IDOR wiring comes later. */
	@Get('users/:userId')
	list(@Param('userId') userId: string, @Query('limit') limit?: string) {
		const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
		return this.activity.listForUser(userId, take);
	}
}
