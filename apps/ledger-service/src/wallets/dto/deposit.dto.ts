import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
	@ApiProperty({ example: 100, minimum: 0.01 })
	@IsNumber()
	@IsPositive()
	amount: number;
}
