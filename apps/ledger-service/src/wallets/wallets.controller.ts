import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletsService } from './wallets.service';
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
export class WalletsController {
	constructor(private readonly wallets: WalletsService) {}

	@Get('wallets')
	@UseGuards(JwtAuthGuard)
	list(@Request() req: AuthenticatedRequest) {
		return this.wallets.listForUser(req.user.userId);
	}

	/** Payments saga: resolve recipient wallet + currency (do not trust client toCurrency). */
	@Get('wallets/resolve')
	resolveDestination(
		@Query('identifier') identifier: string,
		@Query('preferCurrency') preferCurrency?: string,
	) {
		return this.wallets.resolveDestination(identifier, preferCurrency);
	}

	@Get('wallets/:id/events')
	@UseGuards(JwtAuthGuard)
	listEvents(@Param('id') id: string) {
		return this.wallets.listEvents(id);
	}

	/** Readable by payments saga (no user JWT) — returns projection view. */
	@Get('wallets/:id')
	getOne(@Param('id') id: string) {
		return this.wallets.getById(id);
	}

	@Post('wallets/:id/deposit')
	@UseGuards(JwtAuthGuard)
	deposit(@Param('id') id: string, @Body() dto: DepositDto) {
		return this.wallets.deposit(id, dto.amount);
	}

	@Post('wallets/:id/withdraw')
	@UseGuards(JwtAuthGuard)
	withdraw(@Param('id') id: string, @Body() dto: WithdrawDto) {
		return this.wallets.withdraw(id, dto.amount);
	}

	/** Internal / saga: place hold on sender wallet */
	@Post('wallets/:id/holds')
	placeHold(@Param('id') id: string, @Body() dto: PlaceHoldDto) {
		return this.wallets.placeHold({
			walletId: id,
			amount: dto.amount,
			currency: dto.currency,
			sagaId: dto.sagaId,
			commandId: dto.commandId,
		});
	}

	@Post('holds/:id/capture')
	captureHold(@Param('id') id: string, @Body() dto: HoldActionDto) {
		return this.wallets.captureHold(id, dto.commandId);
	}

	@Post('holds/:id/release')
	releaseHold(@Param('id') id: string, @Body() dto: HoldActionDto) {
		return this.wallets.releaseHold(id, dto.commandId);
	}

	@Get('holds/:id')
	getHold(@Param('id') id: string) {
		return this.wallets.getHold(id);
	}

	@Post('wallets/credit')
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

	@Post('wallets/:id/debit-compensation')
	debitCompensation(@Param('id') id: string, @Body() dto: DebitCompensationDto) {
		return this.wallets.debitForCompensation(id, dto.amount, dto.commandId);
	}
}
