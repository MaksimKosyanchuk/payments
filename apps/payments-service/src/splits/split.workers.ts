import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SplitsService } from './splits.service';

@Injectable()
export class SplitWorkers {
	private readonly logger = new Logger(SplitWorkers.name);
	private running = false;

	constructor(private readonly splits: SplitsService) {}

	@Cron(CronExpression.EVERY_5_SECONDS)
	async syncPaid(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			const n = await this.splits.syncPaidShares();
			if (n > 0) this.logger.debug(`synced ${n} paid shares`);
		} catch (err) {
			this.logger.error(
				`syncPaid failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			this.running = false;
		}
	}

	@Cron(CronExpression.EVERY_MINUTE)
	async overdue(): Promise<void> {
		try {
			const n = await this.splits.markOverdue();
			if (n > 0) this.logger.log(`marked ${n} shares overdue`);
		} catch (err) {
			this.logger.error(
				`overdue failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
