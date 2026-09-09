import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HoldActionDto {
	@ApiProperty({ example: 'hold-action-123456' })
	@IsString()
	@Length(8, 128)
	commandId: string;

	@IsOptional()
	@ApiPropertyOptional({ format: 'uuid' })
	@IsUUID()
	sagaId?: string;
}
