import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
	@ApiProperty({ description: 'Refresh token returned by login or register' })
	@IsString()
	refreshToken: string;
}
