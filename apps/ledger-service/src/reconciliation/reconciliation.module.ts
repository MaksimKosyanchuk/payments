import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from '../wallets/entities/journal-entry.entity';
import { LedgerEvent } from '../wallets/entities/ledger-event.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletsModule } from '../wallets/wallets.module';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([JournalEntry, LedgerEvent, Wallet]),
		WalletsModule,
	],
	controllers: [ReconciliationController],
	providers: [ReconciliationService],
	exports: [ReconciliationService],
})
export class ReconciliationModule {}
