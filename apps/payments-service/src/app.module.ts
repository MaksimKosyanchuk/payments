import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { TransfersModule } from './transfers/transfers.module';
import { SagaModule } from './saga/saga.module';
import { OutboxModule } from './outbox/outbox.module';
import { QueueModule } from './queue/queue.module';
import { FxModule } from './fx/fx.module';
import { SplitsModule } from './splits/splits.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRoot([{ ttl: 60, limit: 30 }]),
		PrismaModule,
		FxModule,
		SagaModule,
		TransfersModule,
		SplitsModule,
		OutboxModule,
		QueueModule,
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
