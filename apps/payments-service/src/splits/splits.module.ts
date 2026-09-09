import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TransfersModule } from '../transfers/transfers.module';
import { SplitsController } from './splits.controller';
import { SplitsService } from './splits.service';
import { SplitWorkers } from './split.workers';

@Module({
	imports: [LedgerModule, OutboxModule, TransfersModule, FxModule],
	controllers: [SplitsController],
	providers: [SplitsService, SplitWorkers],
	exports: [SplitsService],
})
export class SplitsModule {}
