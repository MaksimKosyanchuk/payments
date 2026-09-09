import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SagaService } from './saga.service';

/**
 * Retries Compensating transfers whose nextRetryAt is due.
 * Keeps money-fixing compensations alive across process restarts (Prisma-backed).
 */
@Injectable()
export class CompensationWorker {
	private readonly logger = new Logger(CompensationWorker.name);
	private running = false;

	constructor(private readonly saga: SagaService) {}

	@Cron(CronExpression.EVERY_5_SECONDS)
	async tick(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			const n = await this.saga.retryDueCompensations();
			if (n > 0) {
				this.logger.log(`Compensation worker processed ${n} transfer(s)`);
			}
		} catch (err) {
			this.logger.error(
				`Compensation worker failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			this.running = false;
		}
	}
}
