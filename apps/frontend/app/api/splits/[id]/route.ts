import { NextRequest, NextResponse } from 'next/server';
import { paymentsFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function GET(
	_req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const bill = await paymentsFetch(
			`/splits/${params.id}?userId=${encodeURIComponent(user.userId)}`,
		);
		return NextResponse.json(bill);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
