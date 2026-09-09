import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';
import { OutboxModule } from './outbox/outbox.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { User } from './auth/entities/user.entity';
import { Wallet } from './wallets/entities/wallet.entity';
import { Hold } from './wallets/entities/hold.entity';
import { LedgerCommand } from './wallets/entities/ledger-command.entity';
import { LedgerEvent } from './wallets/entities/ledger-event.entity';
import { JournalEntry } from './wallets/entities/journal-entry.entity';
import { OutboxMessage } from './wallets/entities/outbox-message.entity';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRoot([{ ttl: 60, limit: 30 }]),
		TypeOrmModule.forRoot({
			type: 'postgres',
			host: process.env.DATABASE_HOST,
			port: Number(process.env.DATABASE_PORT ?? 5432),
			username: process.env.DATABASE_USER,
			password: process.env.DATABASE_PASSWORD,
			database: process.env.DATABASE_NAME,
			entities: [User, Wallet, Hold, LedgerCommand, LedgerEvent, JournalEntry, OutboxMessage],
			synchronize: true, // OK для стартового репо; у бойовому коді — міграції
		}),
		AuthModule,
		WalletsModule,
		OutboxModule,
		ReconciliationModule,
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
