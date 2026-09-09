import { Logger } from '@nestjs/common';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtAccessService } from '../auth/jwt-access.service';
import {
	DomainEvent,
	HISTORY_TRANSFER_TYPES,
	TransferEventPayload,
} from '../events/domain-event';
import { TransferPartiesService } from './transfer-parties.service';

type AuthedSocket = Socket & {
	data: {
		userId?: string;
		email?: string;
		role?: string;
	};
};

@WebSocketGateway({
	cors: { origin: true },
	namespace: '/transfers',
})
export class TransferGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(TransferGateway.name);

	@WebSocketServer()
	server!: Server;

	constructor(
		private readonly jwt: JwtAccessService,
		private readonly parties: TransferPartiesService,
	) {}

	async handleConnection(client: AuthedSocket): Promise<void> {
		try {
			const token = this.extractToken(client);
			if (!token) {
				this.logger.warn(`ws reject ${client.id}: missing token`);
				client.emit('error', { message: 'Unauthorized' });
				client.disconnect(true);
				return;
			}
			const user = await this.jwt.verify(token);
			client.data.userId = user.userId;
			client.data.email = user.email;
			client.data.role = user.role;
			await client.join(this.userRoom(user.userId));
			this.logger.debug(`ws connected ${client.id} user=${user.userId}`);
		} catch (err) {
			this.logger.warn(
				`ws reject ${client.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
			client.emit('error', { message: 'Unauthorized' });
			client.disconnect(true);
		}
	}

	handleDisconnect(client: AuthedSocket): void {
		this.logger.debug(`ws disconnected ${client.id}`);
	}

	/**
	 * Client: socket.emit('subscribe', { transferId })
	 * Joins transfer:{id} only if JWT user is initiator or recipient (Redis parties).
	 */
	@SubscribeMessage('subscribe')
	async handleSubscribe(
		@ConnectedSocket() client: AuthedSocket,
		@MessageBody() body: { transferId?: string },
	) {
		const userId = client.data.userId;
		if (!userId) {
			return { ok: false, error: 'Unauthorized' };
		}
		if (!body?.transferId) {
			return { ok: true, userId };
		}

		const parties = await this.parties.getParties(body.transferId);
		if (!parties) {
			this.logger.warn(
				`subscribe denied user=${userId} transfer=${body.transferId}: parties missing`,
			);
			return { ok: false, error: 'Forbidden' };
		}
		if (!this.parties.isParty(userId, parties)) {
			this.logger.warn(
				`subscribe denied user=${userId} transfer=${body.transferId}: not a party`,
			);
			return { ok: false, error: 'Forbidden' };
		}

		await client.join(this.transferRoom(body.transferId));
		return { ok: true, userId };
	}

	@SubscribeMessage('unsubscribe')
	handleUnsubscribe(
		@ConnectedSocket() client: AuthedSocket,
		@MessageBody() body: { transferId?: string },
	) {
		if (body?.transferId) {
			void client.leave(this.transferRoom(body.transferId));
		}
		return { ok: true };
	}

	/**
	 * Push live progress + history refresh to transfer room and both parties' user rooms.
	 * History socket event: `transfer.history` (see emit below).
	 */
	emitTransferEvent(event: DomainEvent): void {
		const payload = event.payload as TransferEventPayload;
		const transferId = payload.transferId ?? event.correlationId;
		if (!transferId) {
			return;
		}

		const message = {
			eventId: event.eventId,
			type: event.type,
			transferId,
			status: payload.status ?? null,
			currentStep: payload.currentStep ?? null,
			failureReason: payload.failureReason ?? null,
			amount: payload.amount ?? null,
			currency: payload.currency ?? null,
			amountTo: payload.amountTo ?? null,
			toCurrency: payload.toCurrency ?? null,
			fromWalletId: payload.fromWalletId ?? null,
			toWalletId: payload.toWalletId ?? null,
			toIdentifier: payload.toIdentifier ?? null,
			initiatorId: payload.initiatorId ?? null,
			recipientOwnerId: payload.recipientOwnerId ?? null,
			occurredAt: event.occurredAt,
		};

		// Keep Redis parties warm (esp. recipient after lockFx outbox).
		void this.parties.upsertParties(transferId, {
			initiatorId: payload.initiatorId ?? null,
			recipientOwnerId: payload.recipientOwnerId ?? null,
		});

		this.server.to(this.transferRoom(transferId)).emit('transfer.progress', message);
		if (HISTORY_TRANSFER_TYPES.has(event.type)) {
			this.server.to(this.transferRoom(transferId)).emit('transfer.history', message);
		}

		const audience = new Set<string>();
		if (payload.initiatorId) audience.add(payload.initiatorId);
		if (payload.userId) audience.add(payload.userId);
		if (payload.recipientOwnerId) audience.add(payload.recipientOwnerId);

		for (const userId of audience) {
			const room = this.userRoom(userId);
			this.server.to(room).emit('transfer.progress', message);
			// Dedicated in-app notification channel (header toasts / bell).
			this.server.to(room).emit('notification', message);
			if (HISTORY_TRANSFER_TYPES.has(event.type)) {
				this.server.to(room).emit('transfer.history', message);
			}
		}

		if (audience.size === 0) {
			this.logger.warn(
				`transfer event ${event.type} ${transferId} has no initiator/recipient — WS user rooms skipped`,
			);
		}
	}

	/** In-app notification only (split bill overdue / settled, etc.). */
	emitNotificationOnly(event: DomainEvent): void {
		const payload = event.payload as TransferEventPayload & { userIds?: string[] };
		const message = {
			eventId: event.eventId,
			type: event.type,
			transferId: (payload as { billId?: string }).billId ?? event.correlationId ?? '',
			status: payload.status ?? null,
			currentStep: null,
			failureReason: null,
			amount: typeof payload.amount === 'number' ? payload.amount : null,
			currency: payload.currency ?? null,
			amountTo: null,
			toCurrency: null,
			fromWalletId: null,
			toWalletId: null,
			toIdentifier: null,
			initiatorId: payload.initiatorId ?? null,
			recipientOwnerId: payload.recipientOwnerId ?? null,
			occurredAt: event.occurredAt,
			title: (payload as { title?: string }).title ?? null,
		};

		const audience = new Set<string>();
		if (payload.initiatorId) audience.add(payload.initiatorId);
		if (payload.userId) audience.add(payload.userId);
		if (payload.recipientOwnerId) audience.add(payload.recipientOwnerId);
		if (Array.isArray(payload.userIds)) {
			for (const id of payload.userIds) {
				if (id) audience.add(id);
			}
		}

		for (const userId of audience) {
			this.server.to(this.userRoom(userId)).emit('notification', message);
		}
	}

	private extractToken(client: Socket): string | null {
		const auth = client.handshake.auth as { token?: string } | undefined;
		if (auth?.token) {
			return auth.token;
		}
		const header = client.handshake.headers.authorization;
		return this.jwt.extractBearer(header);
	}

	private transferRoom(transferId: string): string {
		return `transfer:${transferId}`;
	}

	private userRoom(userId: string): string {
		return `user:${userId}`;
	}
}
