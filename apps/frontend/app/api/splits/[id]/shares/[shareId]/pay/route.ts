import { NextRequest, NextResponse } from 'next/server';
import { paymentsFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string; shareId: string } },
) {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await req.json();
	try {
		const result = await paymentsFetch(
			`/splits/${params.id}/shares/${params.shareId}/pay`,
			{
				method: 'POST',
				body: JSON.stringify({
					payerId: user.userId,
					fromWalletId: body.fromWalletId,
				}),
			},
		);
		return NextResponse.json(result);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 502 });
	}
}
