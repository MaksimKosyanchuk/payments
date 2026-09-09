import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceAuthGuard } from '../src/auth/guards/service-auth.guard';

describe('ServiceAuthGuard', () => {
	function guardWithKey(key: string | undefined) {
		return new ServiceAuthGuard({
			get: () => key,
		} as unknown as ConfigService);
	}

	function ctx(headers: Record<string, string>) {
		return {
			switchToHttp: () => ({
				getRequest: () => ({ headers }),
			}),
		} as never;
	}

	it('rejects when API key env is missing', () => {
		const guard = guardWithKey(undefined);
		expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
	});

	it('accepts matching x-service-key', () => {
		const guard = guardWithKey('secret');
		expect(guard.canActivate(ctx({ 'x-service-key': 'secret' }))).toBe(true);
	});

	it('rejects wrong key', () => {
		const guard = guardWithKey('secret');
		expect(() => guard.canActivate(ctx({ 'x-service-key': 'nope' }))).toThrow(
			UnauthorizedException,
		);
	});

	it('accepts Service <key> authorization form', () => {
		const guard = guardWithKey('secret');
		expect(guard.canActivate(ctx({ authorization: 'Service secret' }))).toBe(true);
	});
});
