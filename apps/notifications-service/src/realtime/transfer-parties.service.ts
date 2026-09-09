import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Must match payments-service QueueService.TRANSFER_PARTIES_KEY_PREFIX */
export const TRANSFER_PARTIES_KEY_PREFIX = 'transfer:parties:';
const TRANSFER_PARTIES_TTL_SEC = 60 * 60 * 24 * 7;

export type TransferParties = {
	initiatorId: string | null;
	recipientOwnerId: string | null;
};

@Injectable()
export class TransferPartiesService implements OnModuleDestroy {
	private readonly logger = new Logger(TransferPartiesService.name);
	private readonly redis: Redis | null;

	constructor(private readonly config: ConfigService) {
		const url = this.config.get<string>('REDIS_URL');
		if (!url) {
			this.logger.warn('REDIS_URL not set — transfer parties ACL disabled');
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

	async onModuleDestroy(): Promise<void> {
		if (this.redis) {
			await this.redis.quit().catch(() => undefined);
		}
	}

	private async ensureConnected(): Promise<Redis | null> {
		if (!this.redis) {
			return null;
		}
		if (this.redis.status !== 'ready') {
			await this.redis.connect();
		}
		return this.redis;
	}

	async getParties(transferId: string): Promise<TransferParties | null> {
		const redis = await this.ensureConnected();
		if (!redis) {
			return null;
		}
		const raw = await redis.hgetall(`${TRANSFER_PARTIES_KEY_PREFIX}${transferId}`);
		if (!raw || (!raw.initiatorId && !raw.recipientOwnerId)) {
			return null;
		}
		return {
			initiatorId: raw.initiatorId || null,
			recipientOwnerId: raw.recipientOwnerId || null,
		};
	}

	/** Upsert from stream events (fills recipient after lockFx / outbox). */
	async upsertParties(
		transferId: string,
		parties: TransferParties,
	): Promise<void> {
		const redis = await this.ensureConnected();
		if (!redis) {
			return;
		}
		const key = `${TRANSFER_PARTIES_KEY_PREFIX}${transferId}`;
		const existing = await redis.hgetall(key);
		const initiatorId =
			parties.initiatorId || existing.initiatorId || '';
		const recipientOwnerId =
			parties.recipientOwnerId || existing.recipientOwnerId || '';
		await redis.hset(key, { initiatorId, recipientOwnerId });
		await redis.expire(key, TRANSFER_PARTIES_TTL_SEC);
	}

	/** True if userId is sender or recipient for this transfer. */
	isParty(userId: string, parties: TransferParties): boolean {
		if (parties.initiatorId && parties.initiatorId === userId) {
			return true;
		}
		if (parties.recipientOwnerId && parties.recipientOwnerId === userId) {
			return true;
		}
		return false;
	}
}
