import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { SagaModule } from '../saga/saga.module';
import { QueueModule } from '../queue/queue.module';

@Module({
	imports: [SagaModule, QueueModule],
	controllers: [TransfersController],
	providers: [TransfersService],
	exports: [TransfersService],
})
export class TransfersModule {}
