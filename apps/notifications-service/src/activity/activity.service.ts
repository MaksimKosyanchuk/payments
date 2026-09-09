import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEvent, TransferEventPayload } from '../events/domain-event';

@Injectable()
export class ActivityService {
	private readonly logger = new Logger(ActivityService.name);

	constructor(private readonly prisma: PrismaService) {}

	/** @returns false if this eventId was already processed. */
	async claimEvent(eventId: string, type: string): Promise<boolean> {
		try {
			await this.prisma.processedEvent.create({
				data: { eventId, type },
			});
			return true;
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
				return false;
			}
			throw err;
		}
	}

	async appendForUser(
		userId: string,
		type: string,
		payload: Record<string, unknown>,
		eventId: string,
	) {
		return this.prisma.activityItem.create({
			data: {
				userId,
				type,
				eventId,
				payload: payload as Prisma.InputJsonValue,
			},
		});
	}

	/**
	 * Persist activity when we know the user. Transfer payloads may omit userId —
	 * then only WS push happens (room by transferId).
	 */
	async recordTransferActivity(event: DomainEvent): Promise<void> {
		const payload = event.payload as TransferEventPayload;
		const userId = payload.initiatorId ?? payload.userId;
		if (!userId) {
			this.logger.debug(
				`skip activity persist type=${event.type} eventId=${event.eventId} (no userId)`,
			);
			return;
		}

		try {
			await this.appendForUser(userId, event.type, event.payload, event.eventId);
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
				return;
			}
			throw err;
		}
	}

	async listForUser(userId: string, take = 50) {
		return this.prisma.activityItem.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take,
		});
	}
}
