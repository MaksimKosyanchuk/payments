import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Post('register')
	@ApiOperation({ summary: 'Register a user' })
	@ApiResponse({ status: 201, description: 'User registered and tokens issued' })
	@ApiResponse({ status: 409, description: 'Email is already registered' })
	register(@Body() dto: RegisterDto) {
		return this.auth.register(dto);
	}

	@Throttle({ default: { limit: 5, ttl: 60000 } })
	@Post('login')
	@ApiOperation({ summary: 'Login and issue access/refresh tokens' })
	@ApiResponse({ status: 201, description: 'Credentials accepted and tokens issued' })
	@ApiResponse({ status: 401, description: 'Invalid credentials' })
	login(@Body() dto: LoginDto) {
		return this.auth.login(dto);
	}

	@Post('refresh')
	@ApiOperation({ summary: 'Rotate tokens using a refresh token' })
	@ApiResponse({ status: 201, description: 'New tokens issued' })
	@ApiResponse({ status: 401, description: 'Refresh token is invalid or expired' })
	refresh(@Body() dto: RefreshDto) {
		return this.auth.refresh(dto.refreshToken);
	}
}
