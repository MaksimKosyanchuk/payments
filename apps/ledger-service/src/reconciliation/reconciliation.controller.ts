import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ReconciliationService } from './reconciliation.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReconciliationController {
	constructor(private readonly reconciliation: ReconciliationService) {}

	/** Global journal invariant + projection vs event rebuild for wallets. */
	@Get('reconciliation')
	reconcileAll() {
		return this.reconciliation.reconcileAll();
	}

	@Get('wallets/:id/reconciliation')
	reconcileWallet(@Param('id') id: string) {
		return this.reconciliation.reconcileWallet(id);
	}
}
