import { Module } from '@nestjs/common';
import { TransferGateway } from './transfer.gateway';
import { TransferPartiesService } from './transfer-parties.service';

@Module({
	providers: [TransferPartiesService, TransferGateway],
	exports: [TransferGateway, TransferPartiesService],
})
export class RealtimeModule {}
