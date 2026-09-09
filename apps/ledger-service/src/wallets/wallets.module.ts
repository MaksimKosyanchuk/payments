import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { Wallet } from './entities/wallet.entity';
import { Hold } from './entities/hold.entity';
import { LedgerCommand } from './entities/ledger-command.entity';
import { LedgerEvent } from './entities/ledger-event.entity';
import { JournalEntry } from './entities/journal-entry.entity';

@Module({
	imports: [
		AuthModule,
		TypeOrmModule.forFeature([
			Wallet,
			Hold,
			User,
			LedgerCommand,
			LedgerEvent,
			JournalEntry,
		]),
	],
	controllers: [WalletsController],
	providers: [WalletsService],
	exports: [WalletsService],
})
export class WalletsModule {}
