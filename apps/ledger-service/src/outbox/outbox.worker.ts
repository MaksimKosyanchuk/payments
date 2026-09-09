import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OutboxMessage } from '../wallets/entities/outbox-message.entity';
import { OutboxPublisher } from './outbox.publisher';

@Injectable()
export class OutboxWorker {
	private readonly logger = new Logger(OutboxWorker.name);
	private running = false;

	constructor(
		@InjectRepository(OutboxMessage)
		private readonly outbox: Repository<OutboxMessage>,
		private readonly publisher: OutboxPublisher,
	) {}

	@Cron(CronExpression.EVERY_SECOND)
	async tick(): Promise<void> {
		if (this.running || !this.publisher.enabled) return;
		this.running = true;
		try {
			const batch = await this.outbox.find({
				where: { publishedAt: IsNull() },
				order: { createdAt: 'ASC' },
				take: 50,
			});
			for (const msg of batch) {
				try {
					await this.publisher.publish(msg);
					msg.publishedAt = new Date();
					await this.outbox.save(msg);
				} catch (err) {
					this.logger.error(
						`Outbox publish failed id=${msg.id}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
					break; // keep order; retry next tick
				}
			}
		} finally {
			this.running = false;
		}
	}
}
