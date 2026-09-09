import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxMessage } from '@prisma/client';
import Redis from 'ioredis';

/** Shared with notifications-service — ACL for WS transfer rooms. */
export const TRANSFER_PARTIES_KEY_PREFIX = 'transfer:parties:';
const TRANSFER_PARTIES_TTL_SEC = 60 * 60 * 24 * 7; // 7d

export type TransferParties = {
	initiatorId: string | null;
	recipientOwnerId: string | null;
};

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

	private async ensureConnected(): Promise<Redis> {
		if (!this.redis) {
			throw new Error('Redis not configured');
		}
		if (this.redis.status !== 'ready') {
			await this.redis.connect();
		}
		return this.redis;
	}

	/**
	 * Cache sender/recipient for a transfer so notifications can ACL `subscribe`.
	 * Recipient may be null until lockFx resolves destination.
	 */
	async setTransferParties(
		transferId: string,
		parties: TransferParties,
	): Promise<void> {
		if (!this.redis) {
			this.logger.warn(`skip setTransferParties ${transferId}: Redis disabled`);
			return;
		}
		const redis = await this.ensureConnected();
		const key = `${TRANSFER_PARTIES_KEY_PREFIX}${transferId}`;
		await redis.hset(key, {
			initiatorId: parties.initiatorId ?? '',
			recipientOwnerId: parties.recipientOwnerId ?? '',
		});
		await redis.expire(key, TRANSFER_PARTIES_TTL_SEC);
	}

	async publishOutbox(message: OutboxMessage): Promise<string> {
		const redis = await this.ensureConnected();

		const id = await redis.xadd(
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
