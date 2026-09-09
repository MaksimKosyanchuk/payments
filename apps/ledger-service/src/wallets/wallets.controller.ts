import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiSecurity,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ServiceAuth } from '../auth/decorators/service-auth.decorator';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { PlaceHoldDto } from './dto/place-hold.dto';
import { HoldActionDto } from './dto/hold-action.dto';
import { CreditDto } from './dto/credit.dto';
import { DebitCompensationDto } from './dto/debit-compensation.dto';

interface AuthenticatedRequest {
	user: { userId: string; email: string; role: string };
}

@Controller()
@ApiTags('wallets')
export class WalletsController {
	constructor(private readonly wallets: WalletsService) {}

	@Get('wallets')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'List wallets owned by the current user' })
	@ApiResponse({ status: 200, description: 'Owned wallet projections' })
	@ApiResponse({ status: 401, description: 'Authentication required' })
	list(@Request() req: AuthenticatedRequest) {
		return this.wallets.listForUser(req.user.userId);
	}

	@Post('wallets')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Create or get a wallet for the current user' })
	@ApiResponse({ status: 201, description: 'Wallet projection' })
	create(@Request() req: AuthenticatedRequest, @Body() dto: CreateWalletDto) {
		return this.wallets.getOrCreateForUser(req.user.userId, dto.currency);
	}

	/** Static path before `wallets/:id` so "resolve" is not captured as id. */
	@ServiceAuth()
	@Get('wallets/resolve')
	@ApiSecurity('service-key')
	@ApiOperation({ summary: 'Resolve a recipient identifier to a wallet and currency' })
	@ApiQuery({ name: 'identifier', required: true, description: 'Recipient email or wallet UUID' })
	@ApiQuery({ name: 'preferCurrency', required: false, enum: ['USD', 'EUR', 'UAH'] })
	@ApiResponse({ status: 200, description: 'Resolved destination' })
	@ApiResponse({ status: 404, description: 'Recipient not found' })
	resolveDestination(
		@Query('identifier') identifier: string,
		@Query('preferCurrency') preferCurrency?: string,
	) {
		return this.wallets.resolveDestination(identifier, preferCurrency);
	}

	/** User: own wallet only (TZ §3.2 IDOR fix). */
	@Get('wallets/:id')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiOperation({ summary: 'Get an owned wallet projection' })
	@ApiResponse({ status: 200, description: 'Wallet projection' })
	@ApiResponse({ status: 404, description: 'Wallet not found or not owned by the user' })
	getOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.wallets.getOwnedById(id, req.user.userId);
	}

	@Get('wallets/:id/events')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiOperation({ summary: 'List the owned wallet event stream' })
	@ApiResponse({ status: 200, description: 'Chronological wallet events' })
	listEvents(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.wallets.listEvents(id, req.user.userId);
	}

	@Post('wallets/:id/deposit')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiOperation({ summary: 'Deposit funds into an owned wallet' })
	@ApiResponse({ status: 201, description: 'Updated wallet projection' })
	deposit(@Param('id') id: string, @Body() dto: DepositDto) {
		return this.wallets.deposit(id, dto.amount);
	}

	@Post('wallets/:id/withdraw')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiOperation({ summary: 'Withdraw available funds from an owned wallet' })
	@ApiResponse({ status: 201, description: 'Updated wallet projection' })
	@ApiResponse({ status: 400, description: 'Insufficient funds or invalid amount' })
	withdraw(@Param('id') id: string, @Body() dto: WithdrawDto) {
		return this.wallets.withdraw(id, dto.amount);
	}

	@ServiceAuth()
	@Get('internal/wallets/:id')
	@ApiSecurity('service-key')
	@ApiOperation({ summary: 'Get a wallet for an authenticated internal service' })
	@ApiParam({ name: 'id', description: 'Wallet UUID' })
	@ApiResponse({ status: 200, description: 'Wallet projection' })
	@ApiResponse({ status: 401, description: 'Invalid service credentials' })
	getOneInternal(@Param('id') id: string) {
		return this.wallets.getById(id);
	}

	@ServiceAuth()
	@Post('wallets/:id/holds')
	@ApiSecurity('service-key')
	@ApiParam({ name: 'id', description: 'Sender wallet UUID' })
	@ApiOperation({ summary: 'Place an idempotent funds hold' })
	@ApiResponse({ status: 201, description: 'Open hold' })
	@ApiResponse({ status: 400, description: 'Insufficient funds or currency mismatch' })
	placeHold(@Param('id') id: string, @Body() dto: PlaceHoldDto) {
		return this.wallets.placeHold({
			walletId: id,
			amount: dto.amount,
			currency: dto.currency,
			sagaId: dto.sagaId,
			commandId: dto.commandId,
		});
	}

	@ServiceAuth()
	@Post('holds/:id/capture')
	@ApiSecurity('service-key')
	@ApiParam({ name: 'id', description: 'Hold UUID' })
	@ApiOperation({ summary: 'Capture an open hold idempotently' })
	@ApiResponse({ status: 201, description: 'Captured hold' })
	captureHold(@Param('id') id: string, @Body() dto: HoldActionDto) {
		return this.wallets.captureHold(id, dto.commandId);
	}

	@ServiceAuth()
	@Post('holds/:id/release')
	@ApiSecurity('service-key')
	@ApiParam({ name: 'id', description: 'Hold UUID' })
	@ApiOperation({ summary: 'Release an open hold idempotently' })
	@ApiResponse({ status: 201, description: 'Released hold' })
	releaseHold(@Param('id') id: string, @Body() dto: HoldActionDto) {
		return this.wallets.releaseHold(id, dto.commandId);
	}

	@ServiceAuth()
	@Get('holds/:id')
	@ApiSecurity('service-key')
	@ApiParam({ name: 'id', description: 'Hold UUID' })
	@ApiOperation({ summary: 'Get hold status' })
	@ApiResponse({ status: 200, description: 'Hold state' })
	getHold(@Param('id') id: string) {
		return this.wallets.getHold(id);
	}

	@ServiceAuth()
	@Post('wallets/credit')
	@ApiSecurity('service-key')
	@ApiOperation({ summary: 'Credit a recipient wallet idempotently' })
	@ApiResponse({ status: 201, description: 'Credit result and resulting balance' })
	credit(@Body() dto: CreditDto) {
		return this.wallets.credit({
			toWalletId: dto.toWalletId,
			toIdentifier: dto.toIdentifier,
			amount: dto.amount,
			currency: dto.currency,
			sagaId: dto.sagaId,
			commandId: dto.commandId,
		});
	}

	@ServiceAuth()
	@Post('wallets/:id/debit-compensation')
	@ApiSecurity('service-key')
	@ApiParam({ name: 'id', description: 'Wallet UUID to compensate' })
	@ApiOperation({ summary: 'Debit a wallet for saga compensation' })
	@ApiResponse({ status: 201, description: 'Compensation result' })
	debitCompensation(@Param('id') id: string, @Body() dto: DebitCompensationDto) {
		return this.wallets.debitForCompensation(id, dto.amount, dto.commandId);
	}
}
