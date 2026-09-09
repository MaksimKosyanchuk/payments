import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

const PAYMENTS_URL = process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: Request) {
	const user = await getSessionUser();
	if (!user || user.role !== 'admin') {
		return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
	}

	const token = cookies().get('accessToken')?.value;
	const take = new URL(request.url).searchParams.get('take') ?? '20';
	try {
		const response = await fetch(
			`${PAYMENTS_URL}/transfers/admin/recent?take=${encodeURIComponent(take)}`,
			{
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${token}`,
					'x-admin-key': process.env.PAYMENTS_ADMIN_API_KEY ?? '',
				},
				cache: 'no-store',
			},
		);
		const body = await response.text();
		return new NextResponse(body, {
			status: response.status,
			headers: { 'content-type': 'application/json' },
		});
	} catch (error) {
		return NextResponse.json({ error: (error as Error).message }, { status: 502 });
	}
}
