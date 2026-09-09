import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StreamConsumer } from './stream.consumer';
import { MetricsService } from '../observability/metrics';

@Module({
	imports: [ActivityModule, RealtimeModule],
	providers: [StreamConsumer, MetricsService],
	exports: [MetricsService],
})
export class ConsumerModule {}
