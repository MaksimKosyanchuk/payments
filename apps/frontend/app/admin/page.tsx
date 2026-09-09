'use client';

import { useEffect, useMemo, useState } from 'react';

type AdminSummary = {
	ok: boolean;
	journal: {
		debitTotal: string;
		creditTotal: string;
		balanced: boolean;
		entryCount: number;
	};
	walletsChecked: number;
	wallets: Array<{
		walletId: string;
		ok: boolean;
		fromEvents: {
			available: string;
			held: string;
			asOfVersion: number;
			eventCount: number;
		};
	}>;
};

type WalletRow = {
	id: string;
	ownerId: string;
	currency: string;
	createdAt: string;
};

type TraceRow = {
	id: string;
	status: string;
	currentStep: string | null;
	failureReason: string | null;
	amount: number;
	currency: string;
	createdAt: string;
	durationMs: number;
	steps: Array<{ id: string; step: string; status: string; error: string | null; at: string }>;
};

export default function AdminPage() {
	const [summary, setSummary] = useState<AdminSummary | null>(null);
	const [wallets, setWallets] = useState<WalletRow[]>([]);
	const [traces, setTraces] = useState<TraceRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void (async () => {
			try {
				setLoading(true);
				const [reconRes, walletsRes] = await Promise.all([
					fetch('/api/admin/reconciliation'),
					fetch('/api/admin/wallets'),
				]);
				const tracesRes = await fetch('/api/admin/traces?take=20');

				if (!reconRes.ok || !walletsRes.ok || !tracesRes.ok) {
					const reconBody = await reconRes.json().catch(() => null);
					const walletsBody = await walletsRes.json().catch(() => null);
					const tracesBody = await tracesRes.json().catch(() => null);
					throw new Error(
						reconBody?.error ??
							walletsBody?.error ??
							tracesBody?.error ??
							'Admin data is unavailable',
					);
				}

				const recon = (await reconRes.json()) as AdminSummary;
				const walletList = (await walletsRes.json()) as WalletRow[];
				const traceList = (await tracesRes.json()) as TraceRow[];
				setSummary(recon);
				setWallets(walletList);
				setTraces(traceList);
			} catch (err) {
				setError((err as Error).message);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const totalBadWallets = useMemo(
		() => summary?.wallets.filter((w) => !w.ok).length ?? 0,
		[summary],
	);

	if (loading) {
		return (
			<main style={{ maxWidth: 1100, margin: '32px auto', padding: 20 }}>Loading admin…</main>
		);
	}

	if (error) {
		return (
			<main style={{ maxWidth: 1100, margin: '32px auto', padding: 20 }}>
				<h1>Admin</h1>
				<p style={{ color: 'crimson' }}>{error}</p>
			</main>
		);
	}

	return (
		<main style={{ maxWidth: 1100, margin: '32px auto', padding: 20 }}>
			<h1>Admin panel</h1>

			<section
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
					gap: 16,
					marginBottom: 24,
				}}
			>
				<StatCard
					title="Global reconciliation"
					value={summary?.ok ? 'OK' : 'FAIL'}
					tone={summary?.ok ? 'ok' : 'bad'}
					subtitle={`${summary?.walletsChecked ?? 0} wallets checked`}
				/>
				<StatCard
					title="Journal balance"
					value={summary?.journal.balanced ? 'Balanced' : 'Unbalanced'}
					tone={summary?.journal.balanced ? 'ok' : 'bad'}
					subtitle={`${summary?.journal.debitTotal ?? '0'} / ${summary?.journal.creditTotal ?? '0'}`}
				/>
				<StatCard
					title="Wallet drift"
					value={String(totalBadWallets)}
					tone={totalBadWallets === 0 ? 'ok' : 'bad'}
					subtitle={totalBadWallets === 0 ? 'No drift detected' : 'Rebuild mismatch'}
				/>
				<StatCard
					title="Event entries"
					value={String(summary?.journal.entryCount ?? 0)}
					tone="neutral"
					subtitle="Journal rows"
				/>
			</section>

			<section style={{ marginBottom: 24 }}>
				<h2>Wallet reconciliation</h2>
				<div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ background: '#f7f7f7' }}>
								<th style={{ textAlign: 'left', padding: 10 }}>Wallet</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Status</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Available</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Held</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Version</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Events</th>
							</tr>
						</thead>
						<tbody>
							{(summary?.wallets ?? []).map((wallet) => (
								<tr key={wallet.walletId} style={{ borderTop: '1px solid #eee' }}>
									<td style={{ padding: 10 }}>{wallet.walletId}</td>
									<td
										style={{
											padding: 10,
											color: wallet.ok ? '#1b7f5a' : '#b42318',
											fontWeight: 700,
										}}
									>
										{wallet.ok ? 'OK' : 'Mismatch'}
									</td>
									<td style={{ padding: 10 }}>{wallet.fromEvents.available}</td>
									<td style={{ padding: 10 }}>{wallet.fromEvents.held}</td>
									<td style={{ padding: 10 }}>{wallet.fromEvents.asOfVersion}</td>
									<td style={{ padding: 10 }}>{wallet.fromEvents.eventCount}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>Wallet list</h2>
				<div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ background: '#f7f7f7' }}>
								<th style={{ textAlign: 'left', padding: 10 }}>ID</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Owner</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Currency</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Created</th>
							</tr>
						</thead>
						<tbody>
							{wallets.map((wallet) => (
								<tr key={wallet.id} style={{ borderTop: '1px solid #eee' }}>
									<td style={{ padding: 10 }}>{wallet.id}</td>
									<td style={{ padding: 10 }}>{wallet.ownerId}</td>
									<td style={{ padding: 10 }}>{wallet.currency}</td>
									<td style={{ padding: 10 }}>
										{new Date(wallet.createdAt).toLocaleString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section style={{ marginTop: 24 }}>
				<h2>Recent saga traces</h2>
				<div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ background: '#f7f7f7' }}>
								<th style={{ textAlign: 'left', padding: 10 }}>Transfer</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Status</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Amount</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Duration</th>
								<th style={{ textAlign: 'left', padding: 10 }}>Steps</th>
							</tr>
						</thead>
						<tbody>
							{traces.map((trace) => (
								<tr key={trace.id} style={{ borderTop: '1px solid #eee' }}>
									<td style={{ padding: 10 }}>{trace.id}</td>
									<td style={{ padding: 10 }}>{trace.status}</td>
									<td style={{ padding: 10 }}>
										{trace.amount} {trace.currency}
									</td>
									<td style={{ padding: 10 }}>{trace.durationMs} ms</td>
									<td style={{ padding: 10 }}>
										{trace.steps
											.map((step) => `${step.step}:${step.status}`)
											.join(' → ')}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</main>
	);
}

function StatCard({
	title,
	value,
	subtitle,
	tone,
}: {
	title: string;
	value: string;
	subtitle: string;
	tone: 'ok' | 'bad' | 'neutral';
}) {
	const colors = {
		ok: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
		bad: { bg: '#fef3f2', border: '#fecaca', text: '#b42318' },
		neutral: { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a' },
	};
	const c = colors[tone];

	return (
		<div
			style={{
				background: c.bg,
				border: `1px solid ${c.border}`,
				borderRadius: 10,
				padding: 16,
			}}
		>
			<div style={{ color: '#4b5563', fontSize: 13 }}>{title}</div>
			<div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: c.text }}>
				{value}
			</div>
			<div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>{subtitle}</div>
		</div>
	);
}
