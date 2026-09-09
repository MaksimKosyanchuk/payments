import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class HoldActionDto {
	@IsString()
	@Length(8, 128)
	commandId: string;

	@IsOptional()
	@IsUUID()
	sagaId?: string;
}
