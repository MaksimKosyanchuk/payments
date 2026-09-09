import { JwtAccessService } from './jwt-access.service';

describe('JwtAccessService', () => {
	const secret = 'test-secret';
	let service: JwtAccessService;

	beforeEach(() => {
		service = new JwtAccessService({
			get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? secret : undefined),
		} as never);
	});

	it('extracts bearer token', () => {
		expect(service.extractBearer('Bearer abc.def')).toBe('abc.def');
		expect(service.extractBearer(undefined)).toBeNull();
		expect(service.extractBearer('Token x')).toBeNull();
	});

	it('verifies valid HS256 token', async () => {
		const { SignJWT } = await import('jose');
		const token = await new SignJWT({ email: 'a@b.c', role: 'user' })
			.setProtectedHeader({ alg: 'HS256' })
			.setSubject('user-1')
			.setExpirationTime('5m')
			.sign(new TextEncoder().encode(secret));

		await expect(service.verify(token)).resolves.toEqual({
			userId: 'user-1',
			email: 'a@b.c',
			role: 'user',
		});
	});

	it('rejects invalid token', async () => {
		await expect(service.verify('not.a.jwt')).rejects.toThrow(/Invalid or expired/);
	});
});
