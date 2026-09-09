import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ledgerFetch } from '@/lib/api';

export default async function WalletsPage() {
	const token = cookies().get('accessToken')?.value;
	if (!token) {
		redirect('/login');
	}

	let wallets: { id: string; currency: string; balance?: string; available?: string }[] = [];
	let loadError: string | null = null;

	try {
		wallets = await ledgerFetch('/wallets', {
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch (err) {
		loadError = (err as Error).message;
	}

	return (
		<main style={{ maxWidth: 480, margin: '80px auto', padding: 16 }}>
			<h1>Мої гаманці</h1>
			<p>
				<a href="/transfer">Зробити переказ →</a>
			</p>
			{loadError && <p style={{ color: 'crimson' }}>{loadError}</p>}
			{!loadError && wallets.length === 0 && <p>Гаманців поки немає.</p>}
			<ul>
				{wallets.map((w) => (
					<li key={w.id}>
						{w.currency}: {w.available ?? w.balance ?? '—'}{' '}
						<span style={{ color: '#999', fontSize: 12 }}>{w.id.slice(0, 8)}</span>
					</li>
				))}
			</ul>
		</main>
	);
}
