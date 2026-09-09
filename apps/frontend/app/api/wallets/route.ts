import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ledgerFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const token = cookies().get('accessToken')?.value;
	try {
		const wallets = await ledgerFetch('/wallets', {
			headers: { Authorization: `Bearer ${token}` },
		});
		return NextResponse.json(wallets);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
