import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from '../wallets/entities/outbox-message.entity';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxWorker } from './outbox.worker';

@Module({
	imports: [TypeOrmModule.forFeature([OutboxMessage])],
	providers: [OutboxPublisher, OutboxWorker],
	exports: [OutboxPublisher],
})
export class OutboxModule {}
