import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWalletDto {
	@ApiProperty({ enum: ['USD', 'EUR', 'UAH'], example: 'USD' })
	@IsString()
	@IsIn(['USD', 'EUR', 'UAH'], { message: 'currency must be USD, EUR, or UAH' })
	currency: string;
}
