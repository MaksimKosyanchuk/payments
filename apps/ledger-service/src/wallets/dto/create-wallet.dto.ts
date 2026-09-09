import { IsIn, IsString } from 'class-validator';

export class CreateWalletDto {
	@IsString()
	@IsIn(['USD', 'EUR', 'UAH'], { message: 'currency must be USD, EUR, or UAH' })
	currency: string;
}
