import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaySplitShareDto {
	@ApiProperty({ format: 'uuid', description: 'User paying the share' })
	@IsUUID()
	payerId: string;

	@ApiProperty({ format: 'uuid', description: 'Wallet debited for the payment' })
	@IsUUID()
	fromWalletId: string;
}
