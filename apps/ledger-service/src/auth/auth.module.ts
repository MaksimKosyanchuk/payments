import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ServiceAuthGuard } from './guards/service-auth.guard';

@Module({
	imports: [TypeOrmModule.forFeature([User]), PassportModule, JwtModule.register({})],
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy, ServiceAuthGuard],
	exports: [JwtStrategy, PassportModule, ServiceAuthGuard],
})
export class AuthModule {}
