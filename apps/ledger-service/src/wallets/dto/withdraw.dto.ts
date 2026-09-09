import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawDto {
	@ApiProperty({ example: 25, minimum: 0.01 })
	@IsNumber()
	@IsPositive()
	amount: number;
}
