import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenUser, JwtAccessService } from './jwt-access.service';

export type AuthedRequest = Request & { user: AccessTokenUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(private readonly jwt: JwtAccessService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthedRequest>();
		const token = this.jwt.extractBearer(req.headers.authorization);
		if (!token) {
			throw new UnauthorizedException('Missing Bearer token');
		}
		req.user = await this.jwt.verify(token);
		return true;
	}
}
