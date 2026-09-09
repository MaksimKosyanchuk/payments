import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ReconciliationService } from './reconciliation.service';
import { WalletsService } from '../wallets/wallets.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiTags('admin')
@ApiBearerAuth()
export class ReconciliationController {
	constructor(
		private readonly reconciliation: ReconciliationService,
		private readonly wallets: WalletsService,
	) {}

	/** Global journal invariant + projection vs event rebuild for wallets. */
	@Get('reconciliation')
	@ApiOperation({ summary: 'Run global journal and projection reconciliation' })
	@ApiResponse({ status: 200, description: 'Global reconciliation report' })
	@ApiResponse({ status: 403, description: 'Admin role required' })
	reconcileAll() {
		return this.reconciliation.reconcileAll();
	}

	@Get('wallets/:id/reconciliation')
	@ApiOperation({ summary: 'Reconcile one wallet' })
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiResponse({ status: 200, description: 'Wallet reconciliation report' })
	reconcileWallet(@Param('id') id: string) {
		return this.reconciliation.reconcileWallet(id);
	}

	/** Chronological event log for a wallet (TZ admin). */
	@Get('wallets/:id/events')
	@ApiOperation({ summary: 'View a wallet event log' })
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiResponse({ status: 200, description: 'Chronological event log' })
	async walletEvents(@Param('id') id: string) {
		const events = await this.wallets.listEventsAdmin(id);
		return events.map((e) => ({
			id: e.id,
			streamId: e.streamId,
			version: e.version,
			type: e.type,
			payload: e.payload,
			occurredAt: e.occurredAt?.toISOString?.() ?? e.occurredAt,
			correlationId: e.correlationId,
			schemaVersion: e.schemaVersion,
		}));
	}

	@Get('wallets')
	@ApiOperation({ summary: 'List wallets with computed balances' })
	@ApiQuery({
		name: 'take',
		required: false,
		type: Number,
		description: 'Number of wallets to return, clamped to 1..200',
	})
	@ApiResponse({ status: 200, description: 'Recent wallets and balance projections' })
	listWallets(@Query('take') take?: string) {
		const n = take ? Number(take) : 50;
		return this.wallets.listWalletsAdmin(Number.isFinite(n) ? n : 50);
	}
}
