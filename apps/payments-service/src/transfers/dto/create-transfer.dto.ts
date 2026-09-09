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

export class CreateTransferDto {
	@IsUUID()
	fromWalletId: string;

	/** Recipient wallet UUID or email — ledger resolves destination currency. */
	@IsString()
	@Length(3, 255)
	toWalletIdentifier: string;

	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Min(0.01)
	@Max(1_000_000)
	amount: number;

	/** Debit currency (must match fromWallet). Recipient currency is resolved by backend. */
	@IsString()
	@Matches(/^(USD|EUR|UAH)$/i, {
		message: 'currency must be USD, EUR, or UAH',
	})
	currency: string;

	/** Prefer Idempotency-Key header; body field is a fallback. */
	@IsOptional()
	@IsString()
	@Length(8, 128)
	idempotencyKey?: string;
}
