import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/** Expose access token for Socket.IO auth (httpOnly cookie is not readable in browser JS). */
export async function GET() {
	const user = await getSessionUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const accessToken = cookies().get('accessToken')?.value;
	if (!accessToken) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	return NextResponse.json({ accessToken });
}
