import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
export class TransfersController {
	constructor(private readonly transfers: TransfersService) {}

	@Post()
	create(@Body() dto: CreateTransferDto, @Headers('idempotency-key') idempotencyKey?: string) {
		return this.transfers.create(dto, idempotencyKey);
	}

	/** History for a wallet: sent (from) + received (to). */
	@Get()
	list(@Query('walletId') walletId: string) {
		return this.transfers.listForWallet(walletId);
	}

	@Get(':id')
	getStatus(@Param('id') id: string) {
		return this.transfers.getStatus(id);
	}
}
