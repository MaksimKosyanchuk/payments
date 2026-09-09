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
import { DomainEvent, TransferEventPayload } from '../events/domain-event';

@WebSocketGateway({
	cors: { origin: true },
	namespace: '/transfers',
})
export class TransferGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(TransferGateway.name);

	@WebSocketServer()
	server!: Server;

	handleConnection(client: Socket): void {
		this.logger.debug(`ws connected ${client.id}`);
	}

	handleDisconnect(client: Socket): void {
		this.logger.debug(`ws disconnected ${client.id}`);
	}

	/** Client: socket.emit('subscribe', { transferId }) */
	@SubscribeMessage('subscribe')
	handleSubscribe(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { transferId?: string; userId?: string },
	) {
		if (body?.transferId) {
			void client.join(this.transferRoom(body.transferId));
		}
		if (body?.userId) {
			void client.join(this.userRoom(body.userId));
		}
		return { ok: true };
	}

	@SubscribeMessage('unsubscribe')
	handleUnsubscribe(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { transferId?: string; userId?: string },
	) {
		if (body?.transferId) {
			void client.leave(this.transferRoom(body.transferId));
		}
		if (body?.userId) {
			void client.leave(this.userRoom(body.userId));
		}
		return { ok: true };
	}

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
			occurredAt: event.occurredAt,
		};

		this.server.to(this.transferRoom(transferId)).emit('transfer.progress', message);

		const userId = payload.initiatorId ?? payload.userId;
		if (userId) {
			this.server.to(this.userRoom(userId)).emit('transfer.progress', message);
		}
	}

	private transferRoom(transferId: string): string {
		return `transfer:${transferId}`;
	}

	private userRoom(userId: string): string {
		return `user:${userId}`;
	}
}
