import { IsNumber, IsPositive, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DebitCompensationDto {
	@IsNumber()
	@ApiProperty({ example: 50, minimum: 0.01 })
	@IsPositive()
	amount: number;

	@IsString()
	@ApiProperty({ example: 'transfer-key:refundSender' })
	@Length(8, 128)
	commandId: string;
}
