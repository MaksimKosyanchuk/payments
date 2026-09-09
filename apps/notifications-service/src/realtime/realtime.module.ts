import { Module } from '@nestjs/common';
import { TransferGateway } from './transfer.gateway';

@Module({
	providers: [TransferGateway],
	exports: [TransferGateway],
})
export class RealtimeModule {}
