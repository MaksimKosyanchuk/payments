import { IsNumber, IsOptional, IsPositive } from 'class-validator';

/** Initiator adds themselves to an existing bill (share marked Paid). */
export class AddSelfShareDto {
	@IsOptional()
	@IsNumber()
	@IsPositive()
	amount?: number;
}
