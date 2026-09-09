import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxMessage } from '@prisma/client';
import { QueueService } from '../queue/queue.service';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxDispatcher {
	private readonly logger = new Logger(OutboxDispatcher.name);
	private running = false;

	constructor(
		private readonly outboxService: OutboxService,
		private readonly queueService: QueueService,
	) {}

	@Cron(CronExpression.EVERY_SECOND)
	async dispatch(): Promise<void> {
		if (this.running || !this.queueService.enabled) return;
		this.running = true;
		try {
			const messages = await this.outboxService.findPending();
			for (const message of messages) {
				try {
					await this.queueService.publishOutbox(message);
					await this.outboxService.markPublished(message.id);
				} catch (err) {
					this.logger.error(
						`Outbox publish failed id=${message.id}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
					break;
				}
			}
		} finally {
			this.running = false;
		}
	}
}
