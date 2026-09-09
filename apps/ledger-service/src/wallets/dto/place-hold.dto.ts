import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class PlaceHoldDto {
	@IsNumber()
	@IsPositive()
	amount: number;

	@IsString()
	@Length(3, 3)
	currency: string;

	@IsOptional()
	@IsUUID()
	sagaId?: string;

	/** Idempotency for this ledger command */
	@IsString()
	@Length(8, 128)
	commandId: string;
}
