import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxMessage } from '@prisma/client';
import Redis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
	private readonly logger = new Logger(QueueService.name);
	private readonly redis: Redis | null;
	private readonly stream: string;

	constructor(private readonly config: ConfigService) {
		const url = this.config.get<string>('REDIS_URL');
		this.stream = this.config.get<string>('PAYMENTS_EVENTS_STREAM') ?? 'payments.events';
		if (!url) {
			this.logger.warn('REDIS_URL not set — queue publish disabled');
			this.redis = null;
			return;
		}
		this.redis = new Redis(url, {
			maxRetriesPerRequest: 2,
			lazyConnect: true,
		});
		this.redis.on('error', (err) => {
			this.logger.error(`Redis error: ${err.message}`);
		});
	}

	get enabled(): boolean {
		return this.redis != null;
	}

	async onModuleDestroy(): Promise<void> {
		if (this.redis) {
			await this.redis.quit().catch(() => undefined);
		}
	}

	async publishOutbox(message: OutboxMessage): Promise<string> {
		if (!this.redis) {
			throw new Error('Redis not configured');
		}
		if (this.redis.status !== 'ready') {
			await this.redis.connect();
		}

		const id = await this.redis.xadd(
			this.stream,
			'*',
			'eventId',
			message.eventId,
			'type',
			message.type,
			'payload',
			JSON.stringify(message.payload),
			'correlationId',
			message.correlationId ?? '',
			'outboxId',
			message.id,
			'occurredAt',
			message.createdAt.toISOString(),
			'schemaVersion',
			'1',
		);
		return id ?? '';
	}
}
