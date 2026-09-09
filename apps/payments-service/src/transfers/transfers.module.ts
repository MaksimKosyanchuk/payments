import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { SagaModule } from '../saga/saga.module';

@Module({
	imports: [SagaModule],
	controllers: [TransfersController],
	providers: [TransfersService],
})
export class TransfersModule {}
