import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? 'http://localhost:3001';

export async function GET() {
	const user = await getSessionUser();
	if (!user || user.role !== 'admin') {
		return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
	}

	const token = cookies().get('accessToken')?.value;

	try {
		const res = await fetch(`${LEDGER_URL}/admin/reconciliation`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			cache: 'no-store',
		});

		const body = await res.text();
		if (!res.ok) {
			return NextResponse.json(
				{ error: body || 'Reconciliation check failed' },
				{ status: res.status },
			);
		}

		return NextResponse.json(JSON.parse(body));
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
