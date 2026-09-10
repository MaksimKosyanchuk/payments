import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ActivityService } from '../activity/activity.service';
import { DomainEvent } from '../events/domain-event';
import { isTransferEvent } from '../events/transfer.events';
import { isSplitEvent } from '../events/split.events';
import { TransferGateway } from '../realtime/transfer.gateway';
import { MetricsService } from '../observability/metrics';

@Injectable()
export class StreamConsumer implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(StreamConsumer.name);
	private readonly redis: Redis | null;
	private readonly streams: string[];
	private readonly group: string;
	private readonly consumerName: string;
	private running = false;
	private loopPromise: Promise<void> | null = null;

	constructor(
		private readonly config: ConfigService,
		private readonly activity: ActivityService,
		private readonly gateway: TransferGateway,
		private readonly metrics: MetricsService,
	) {
		const url = this.config.get<string>('REDIS_URL');
		this.group = this.config.get<string>('REDIS_CONSUMER_GROUP') ?? 'notifications';
		this.consumerName =
			this.config.get<string>('REDIS_CONSUMER_NAME') ?? `notifications-${process.pid}`;
		const payments = this.config.get<string>('PAYMENTS_EVENTS_STREAM') ?? 'payments.events';
		const ledger = this.config.get<string>('LEDGER_EVENTS_STREAM') ?? 'ledger.events';
		const listenLedger = this.config.get<string>('CONSUME_LEDGER_EVENTS') === 'true';
		this.streams = listenLedger ? [payments, ledger] : [payments];

		if (!url) {
			this.logger.warn('REDIS_URL not set — stream consumer disabled');
			this.redis = null;
			return;
		}
		this.redis = new Redis(url, {
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});
		this.redis.on('error', (err) => {
			this.logger.error(`Redis error: ${err.message}`);
		});
	}

	async onModuleInit(): Promise<void> {
		if (!this.redis) {
			return;
		}
		await this.redis.connect();
		await this.ensureGroups();
		this.running = true;
		this.loopPromise = this.loop();
		this.logger.log(`consumer started group=${this.group} streams=${this.streams.join(',')}`);
	}

	async onModuleDestroy(): Promise<void> {
		this.running = false;
		if (this.loopPromise) {
			await this.loopPromise.catch(() => undefined);
		}
		if (this.redis) {
			await this.redis.quit().catch(() => undefined);
		}
	}

	private async ensureGroups(): Promise<void> {
		if (!this.redis) {
			return;
		}
		for (const stream of this.streams) {
			try {
				await this.redis.xgroup('CREATE', stream, this.group, '0', 'MKSTREAM');
				this.logger.log(`created consumer group ${this.group} on ${stream}`);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!msg.includes('BUSYGROUP')) {
					throw err;
				}
			}
		}
	}

	private async loop(): Promise<void> {
		while (this.running && this.redis) {
			try {
				const result = (await this.redis.xreadgroup(
					'GROUP',
					this.group,
					this.consumerName,
					'COUNT',
					20,
					'BLOCK',
					5000,
					'STREAMS',
					...this.streams,
					...this.streams.map(() => '>'),
				)) as [string, [string, string[]][]][] | null;
				if (!result) {
					continue;
				}
				for (const [stream, entries] of result) {
					for (const [id, fields] of entries) {
						await this.handleEntry(stream, id, fields);
					}
				}
			} catch (err) {
				if (!this.running) {
					return;
				}
				this.logger.error(
					`consumer loop error: ${err instanceof Error ? err.message : String(err)}`,
				);
				await sleep(1000);
			}
		}
	}

	private async handleEntry(stream: string, streamId: string, fields: string[]): Promise<void> {
		if (!this.redis) {
			return;
		}
		const map = fieldsToMap(fields);
		const event = toDomainEvent(stream, streamId, map);
		this.logger.debug(
			`consume event=${event.eventId} type=${event.type} traceparent=${String(event.payload.traceparent ?? map.traceparent ?? '')}`,
		);

		try {
			const claimed = await this.activity.claimEvent(event.eventId, event.type);
			if (!claimed) {
				this.metrics.events.inc({ type: event.type, status: 'deduplicated' });
				this.logger.debug(`dedup skip eventId=${event.eventId}`);
				await this.redis.xack(stream, this.group, streamId);
				return;
			}

			if (isTransferEvent(event.type)) {
				await this.activity.recordTransferActivity(event);
				this.gateway.emitTransferEvent(event);
			} else if (isSplitEvent(event.type)) {
				await this.activity.recordTransferActivity(event);

				this.gateway.emitSplitEvent(event);

				this.gateway.emitNotificationOnly(event);
			} else {
				this.logger.debug(`ignored event type=${event.type}`);
			}

			await this.redis.xack(stream, this.group, streamId);
			this.metrics.events.inc({ type: event.type, status: 'processed' });
		} catch (err) {
			this.metrics.events.inc({ type: event.type, status: 'failed' });
			this.logger.error(
				`handle failed streamId=${streamId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			// leave pending for retry / claim later
		}
	}
}

function fieldsToMap(fields: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i + 1 < fields.length; i += 2) {
		out[fields[i]] = fields[i + 1];
	}
	return out;
}

function toDomainEvent(stream: string, streamId: string, map: Record<string, string>): DomainEvent {
	let payload: Record<string, unknown> = {};
	if (map.payload) {
		try {
			payload = JSON.parse(map.payload) as Record<string, unknown>;
		} catch {
			payload = { raw: map.payload };
		}
	}
	return {
		eventId: map.eventId || streamId,
		type: map.type || 'Unknown',
		payload,
		correlationId: map.correlationId || null,
		occurredAt: map.occurredAt || null,
		schemaVersion: map.schemaVersion || null,
		streamId,
		stream,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
