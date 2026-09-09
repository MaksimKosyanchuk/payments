import { Controller, Get, Headers, Param, Post, Body, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SplitsService } from './splits.service';
import { CreateSplitBillDto } from './dto/create-split-bill.dto';
import { PaySplitShareDto } from './dto/pay-split-share.dto';

@Controller('splits')
@ApiTags('splits')
export class SplitsController {
	constructor(private readonly splits: SplitsService) {}

	@Post()
	@ApiOperation({ summary: 'Create a split bill' })
	@ApiHeader({
		name: 'Idempotency-Key',
		required: true,
		description: '8-128 character key for exactly-once split creation',
	})
	@ApiResponse({ status: 201, description: 'Split bill with participant shares' })
	@ApiResponse({ status: 400, description: 'Invalid participants or amounts' })
	create(@Body() dto: CreateSplitBillDto, @Headers('idempotency-key') idempotencyKey?: string) {
		return this.splits.create(dto, idempotencyKey);
	}

	@Get()
	@ApiOperation({ summary: 'List split bills for a user' })
	@ApiQuery({ name: 'userId', required: true, description: 'User UUID' })
	@ApiResponse({ status: 200, description: 'Split bills visible to the user' })
	list(@Query('userId') userId: string) {
		return this.splits.listForUser(userId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a split bill and its shares' })
	@ApiParam({ name: 'id', description: 'Split bill UUID' })
	@ApiQuery({ name: 'userId', required: true, description: 'User requesting the bill' })
	@ApiResponse({ status: 200, description: 'Split bill details' })
	@ApiResponse({ status: 404, description: 'Split bill not found or inaccessible' })
	getOne(@Param('id') id: string, @Query('userId') userId: string) {
		return this.splits.getById(id, userId);
	}

	@Post(':id/shares/:shareId/pay')
	@ApiOperation({ summary: 'Pay a split share through the transfer saga' })
	@ApiParam({ name: 'id', description: 'Split bill UUID' })
	@ApiParam({ name: 'shareId', description: 'Share UUID' })
	@ApiHeader({ name: 'Idempotency-Key', required: false })
	@ApiResponse({ status: 201, description: 'Transfer created for the share' })
	@ApiResponse({ status: 400, description: 'Share cannot be paid' })
	pay(
		@Param('id') id: string,
		@Param('shareId') shareId: string,
		@Body() dto: PaySplitShareDto,
		@Headers('idempotency-key') idempotencyKey?: string,
	) {
		return this.splits.payShare(id, shareId, dto, idempotencyKey);
	}
}
