import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type SessionUser = {
	userId: string;
	email: string;
	role: string;
};

function secretKey() {
	const secret = process.env.JWT_ACCESS_SECRET ?? 'change-me-access';
	return new TextEncoder().encode(secret);
}

export async function getSessionUser(): Promise<SessionUser | null> {
	const token = cookies().get('accessToken')?.value;
	if (!token) {
		return null;
	}
	try {
		const { payload } = await jwtVerify(token, secretKey());
		const userId = typeof payload.sub === 'string' ? payload.sub : null;
		if (!userId) {
			return null;
		}
		return {
			userId,
			email: typeof payload.email === 'string' ? payload.email : '',
			role: typeof payload.role === 'string' ? payload.role : 'user',
		};
	} catch {
		return null;
	}
}
