import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
export class TransfersController {
	constructor(private readonly transfers: TransfersService) {}

	@Post()
	create(@Body() dto: CreateTransferDto, @Headers('idempotency-key') idempotencyKey?: string) {
		return this.transfers.create(dto, idempotencyKey);
	}

	@Get(':id')
	getStatus(@Param('id') id: string) {
		return this.transfers.getStatus(id);
	}
}
