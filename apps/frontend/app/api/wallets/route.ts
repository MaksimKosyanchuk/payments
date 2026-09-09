import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(req: NextRequest) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const token = cookies().get('accessToken')?.value;
	const body = await req.json();
	const currency = String(body.currency ?? 'USD').toUpperCase();
	if (!['USD', 'EUR', 'UAH'].includes(currency)) {
		return NextResponse.json({ error: 'currency must be USD, EUR, or UAH' }, { status: 400 });
	}
	try {
		const wallet = await ledgerFetch('/wallets', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: JSON.stringify({ currency }),
		});
		return NextResponse.json(wallet);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
