import { Module } from '@nestjs/common';
import { FxMockController } from './fx.mock.controller';
import { FxRatesClient } from './fx.rates.client';
import { FxRefreshWorker } from './fx.refresh.worker';
import { FxService } from './fx.service';

@Module({
	controllers: [FxMockController],
	providers: [FxService, FxRatesClient, FxRefreshWorker],
	exports: [FxService],
})
export class FxModule {}
