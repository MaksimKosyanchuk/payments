import { NextRequest, NextResponse } from 'next/server';
import { paymentsFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await req.json();
	const idempotencyKey =
		req.headers.get('idempotency-key') ??
		body.idempotencyKey ??
		`web-${user.userId}-${Date.now()}`;

	try {
		const result = await paymentsFetch('/transfers', {
			method: 'POST',
			headers: { 'Idempotency-Key': idempotencyKey },
			body: JSON.stringify({
				fromWalletId: body.fromWalletId,
				toWalletIdentifier: body.toWalletIdentifier,
				amount: Number(body.amount),
				currency: body.currency,
				initiatorId: user.userId,
			}),
		});
		return NextResponse.json(result);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
