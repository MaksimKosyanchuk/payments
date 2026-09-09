import { NextResponse } from 'next/server';
import { paymentsFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function GET(
	_req: Request,
	{ params }: { params: { id: string } },
) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const transfer = await paymentsFetch(`/transfers/${params.id}`);
		return NextResponse.json(transfer);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
