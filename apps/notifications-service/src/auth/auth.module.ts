import { Global, Module } from '@nestjs/common';
import { JwtAccessService } from './jwt-access.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
	providers: [JwtAccessService, JwtAuthGuard],
	exports: [JwtAccessService, JwtAuthGuard],
})
export class AuthModule {}
