import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StreamConsumer } from './stream.consumer';

@Module({
	imports: [ActivityModule, RealtimeModule],
	providers: [StreamConsumer],
})
export class ConsumerModule {}
