import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaceHoldDto {
	@ApiProperty({ example: 50, minimum: 0.01 })
	@IsNumber()
	@IsPositive()
	amount: number;

	@IsString()
	@ApiProperty({ enum: ['USD', 'EUR', 'UAH'], example: 'USD' })
	@Length(3, 3)
	currency: string;

	@IsOptional()
	@ApiPropertyOptional({ format: 'uuid' })
	@IsUUID()
	sagaId?: string;

	/** Idempotency for this ledger command */
	@IsString()
	@ApiProperty({ example: 'transfer-key:placeHold' })
	@Length(8, 128)
	commandId: string;
}
