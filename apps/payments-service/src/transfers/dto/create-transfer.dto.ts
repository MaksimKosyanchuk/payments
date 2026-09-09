import {
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Length,
	Matches,
	Max,
	Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransferDto {
	@ApiProperty({ format: 'uuid', description: 'Sender wallet UUID' })
	@IsUUID()
	fromWalletId: string;

	/** Recipient wallet UUID or email — ledger resolves destination currency. */
	@IsString()
	@ApiProperty({
		example: 'recipient@example.com',
		description: 'Recipient email or wallet UUID',
	})
	@Length(3, 255)
	toWalletIdentifier: string;

	@IsNumber({ maxDecimalPlaces: 2 })
	@ApiProperty({ example: 25.5, minimum: 0.01, maximum: 1000000 })
	@IsPositive()
	@Min(0.01)
	@Max(1_000_000)
	amount: number;

	/** Debit currency (must match fromWallet). Recipient currency is resolved by backend. */
	@IsString()
	@ApiProperty({ enum: ['USD', 'EUR', 'UAH'], example: 'USD' })
	@Matches(/^(USD|EUR|UAH)$/i, {
		message: 'currency must be USD, EUR, or UAH',
	})
	currency: string;

	/**
	 * Optional: prefer this currency for the recipient wallet (split bills).
	 * Debit still uses `currency` / fromWallet; FX converts to creditCurrency.
	 */
	@IsOptional()
	@IsString()
	@ApiPropertyOptional({ enum: ['USD', 'EUR', 'UAH'], example: 'EUR' })
	@Matches(/^(USD|EUR|UAH)$/i, {
		message: 'creditCurrency must be USD, EUR, or UAH',
	})
	creditCurrency?: string;

	/** Prefer Idempotency-Key header; body field is a fallback. */
	@IsOptional()
	@IsString()
	@ApiPropertyOptional({ example: 'web-transfer-123456' })
	@Length(8, 128)
	idempotencyKey?: string;

	/** Set by BFF from JWT — used for activity / WS user rooms. */
	@IsOptional()
	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Set by the BFF from the authenticated user',
	})
	@IsUUID()
	initiatorId?: string;
}
