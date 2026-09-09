import {
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
} from 'class-validator';

export class CreditDto {
	@ValidateIf((o: CreditDto) => !o.toIdentifier)
	@IsUUID()
	toWalletId?: string;

	/** email or wallet uuid — resolved if toWalletId omitted */
	@ValidateIf((o: CreditDto) => !o.toWalletId)
	@IsString()
	@Length(3, 255)
	toIdentifier?: string;

	@IsNumber()
	@IsPositive()
	amount: number;

	@IsString()
	@Length(3, 3)
	currency: string;

	@IsOptional()
	@IsUUID()
	sagaId?: string;

	@IsString()
	@Length(8, 128)
	commandId: string;
}
