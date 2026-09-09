import { NextRequest, NextResponse } from 'next/server';
import { paymentsFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const list = await paymentsFetch(`/splits?userId=${encodeURIComponent(user.userId)}`);
		return NextResponse.json(list);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}

export async function POST(req: NextRequest) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await req.json();
	try {
		const result = await paymentsFetch('/splits', {
			method: 'POST',
			body: JSON.stringify({
				initiatorId: user.userId,
				initiatorEmail: user.email,
				toWalletId: body.toWalletId,
				total: Number(body.total),
				currency: body.currency,
				title: body.title,
				dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : undefined,
				participants: body.participants,
			}),
		});
		return NextResponse.json(result);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
