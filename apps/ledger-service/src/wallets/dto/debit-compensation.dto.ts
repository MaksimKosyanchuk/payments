import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class DebitCompensationDto {
	@IsNumber()
	@IsPositive()
	amount: number;

	@IsString()
	@Length(8, 128)
	commandId: string;
}
