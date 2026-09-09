import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OutboxService } from './outbox.service';
import { OutboxDispatcher } from './outboxDispatcher';

@Module({
	imports: [QueueModule],
	providers: [OutboxService, OutboxDispatcher],
	exports: [OutboxService],
})
export class OutboxModule {}
