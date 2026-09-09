import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';

export type AccessTokenUser = {
	userId: string;
	email: string;
	role: string;
};

@Injectable()
export class JwtAccessService {
	private readonly secret: Uint8Array;

	constructor(config: ConfigService) {
		const raw = config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-access';
		this.secret = new TextEncoder().encode(raw);
	}

	async verify(token: string): Promise<AccessTokenUser> {
		try {
			const { payload } = await jwtVerify(token, this.secret);
			const userId = typeof payload.sub === 'string' ? payload.sub : null;
			if (!userId) {
				throw new UnauthorizedException('Invalid token subject');
			}
			return {
				userId,
				email: typeof payload.email === 'string' ? payload.email : '',
				role: typeof payload.role === 'string' ? payload.role : 'user',
			};
		} catch (err) {
			if (err instanceof UnauthorizedException) {
				throw err;
			}
			throw new UnauthorizedException('Invalid or expired access token');
		}
	}

	extractBearer(authorization?: string | string[]): string | null {
		const header = Array.isArray(authorization) ? authorization[0] : authorization;
		if (!header?.startsWith('Bearer ')) {
			return null;
		}
		return header.slice('Bearer '.length).trim() || null;
	}
}
