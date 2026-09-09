import { Module } from '@nestjs/common';
import { LedgerClient } from './ledger.client';

@Module({
	providers: [LedgerClient],
	exports: [LedgerClient],
})
export class LedgerModule {}
