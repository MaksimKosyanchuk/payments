import { Module } from '@nestjs/common';
import { SagaService } from './saga.service';
import { CompensationWorker } from './compensation.worker';
import { TransferStore } from '../transfers/transfer.store';
import { LedgerModule } from '../ledger/ledger.module';
import { FxModule } from '../fx/fx.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../queue/queue.module';

@Module({
	imports: [LedgerModule, FxModule, OutboxModule, QueueModule],
	providers: [SagaService, TransferStore, CompensationWorker],
	exports: [SagaService, TransferStore],
})
export class SagaModule {}
