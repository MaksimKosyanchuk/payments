import {
	ArrayMinSize,
	IsArray,
	IsDateString,
	IsEmail,
	IsIn,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SplitParticipantDto {
	@ApiProperty({ example: 'participant@example.com' })
	@IsEmail()
	email: string;

	/** Custom share; omit for equal split. */
	@IsOptional()
	@ApiPropertyOptional({ example: 25, minimum: 0.01, description: 'Omit for an equal split' })
	@IsNumber()
	@IsPositive()
	amount?: number;
}

/**
 * Organizer creates a collection: participants pay shares INTO toWalletId.
 * Organizer is never a payer.
 */
export class CreateSplitBillDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	initiatorId: string;

	@IsEmail()
	@ApiProperty({ example: 'organizer@example.com' })
	initiatorEmail: string;

	/** Wallet that receives all payments (must belong to initiator). */
	@IsUUID()
	@ApiProperty({ format: 'uuid', description: 'Wallet receiving all share payments' })
	toWalletId: string;

	@IsNumber()
	@ApiProperty({ example: 100, minimum: 0.01 })
	@IsPositive()
	total: number;

	/** Optional override; defaults to toWallet currency. Must match wallet if set. */
	@IsOptional()
	@ApiPropertyOptional({ enum: ['USD', 'EUR', 'UAH'] })
	@IsIn(['USD', 'EUR', 'UAH'])
	currency?: string;

	@IsOptional()
	@ApiPropertyOptional({ example: 'Dinner' })
	@IsString()
	@MaxLength(200)
	title?: string;

	@IsOptional()
	@ApiPropertyOptional({ example: '2026-09-30T18:00:00.000Z', format: 'date-time' })
	@IsDateString()
	dueAt?: string;

	@IsArray()
	@ApiProperty({ type: [SplitParticipantDto] })
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => SplitParticipantDto)
	participants: SplitParticipantDto[];
}
