import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ledgerFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const token = cookies().get('accessToken')?.value;
	const body = await req.json();
	const amount = Number(body.amount);
	if (!Number.isFinite(amount) || amount <= 0) {
		return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
	}
	try {
		const wallet = await ledgerFetch(`/wallets/${params.id}/deposit`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: JSON.stringify({ amount }),
		});
		return NextResponse.json(wallet);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
