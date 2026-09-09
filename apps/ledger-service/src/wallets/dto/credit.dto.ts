import {
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreditDto {
	@ValidateIf((o: CreditDto) => !o.toIdentifier)
	@ApiPropertyOptional({ format: 'uuid' })
	@IsUUID()
	toWalletId?: string;

	/** email or wallet uuid — resolved if toWalletId omitted */
	@ValidateIf((o: CreditDto) => !o.toWalletId)
	@ApiPropertyOptional({ example: 'recipient@example.com' })
	@IsString()
	@Length(3, 255)
	toIdentifier?: string;

	@IsNumber()
	@ApiProperty({ example: 50, minimum: 0.01 })
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

	@IsString()
	@ApiProperty({ example: 'transfer-key:credit' })
	@Length(8, 128)
	commandId: string;
}
