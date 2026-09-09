import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { ConsumerModule } from './consumer/consumer.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		AuthModule,
		PrismaModule,
		ActivityModule,
		RealtimeModule,
		ConsumerModule,
	],
	controllers: [HealthController],
})
export class AppModule {}
