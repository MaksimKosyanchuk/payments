import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

const NOTIFICATIONS_URL =
	process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:3003';

export async function GET() {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const token = cookies().get('accessToken')?.value;
	try {
		const res = await fetch(`${NOTIFICATIONS_URL}/activity/me?limit=50`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			cache: 'no-store',
		});
		const body = await res.text();
		if (!res.ok) {
			return NextResponse.json(
				{ error: body || `activity ${res.status}` },
				{ status: res.status },
			);
		}
		return NextResponse.json(JSON.parse(body));
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
