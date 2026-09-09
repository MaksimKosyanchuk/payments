import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
@ApiTags('transfers')
export class TransfersController {
	constructor(private readonly transfers: TransfersService) {}

	@Throttle({ default: { limit: 20, ttl: 60000 } })
	@Post()
	@ApiOperation({ summary: 'Create an idempotent transfer saga' })
	@ApiHeader({
		name: 'Idempotency-Key',
		required: false,
		description: '8-128 character key; body field is used as fallback',
	})
	@ApiResponse({ status: 201, description: 'Transfer created in Pending state' })
	@ApiResponse({ status: 400, description: 'Invalid transfer input' })
	create(@Body() dto: CreateTransferDto, @Headers('idempotency-key') idempotencyKey?: string) {
		return this.transfers.create(dto, idempotencyKey);
	}

	/** History for a wallet: sent (from) + received (to). */
	@Get()
	@ApiOperation({ summary: 'List transfers involving a wallet' })
	@ApiQuery({ name: 'walletId', required: true, description: 'Wallet UUID' })
	@ApiResponse({ status: 200, description: 'Recent sent and received transfers' })
	list(@Query('walletId') walletId: string) {
		return this.transfers.listForWallet(walletId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get transfer status' })
	@ApiParam({ name: 'id', description: 'Transfer UUID' })
	@ApiResponse({ status: 200, description: 'Current transfer saga state' })
	@ApiResponse({ status: 404, description: 'Transfer not found' })
	getStatus(@Param('id') id: string) {
		return this.transfers.getStatus(id);
	}
}
