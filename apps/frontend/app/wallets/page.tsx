'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveTransfers } from '../components/LiveTransfersProvider';

type Wallet = {
	id: string;
	currency: string;
	balance?: string;
	available?: string;
	held?: string;
};

type TransferRow = {
	id: string;
	fromWalletId: string;
	toWalletId: string | null;
	toIdentifier: string;
	amount: number;
	currency: string;
	amountTo: number;
	toCurrency: string;
	status: string;
	failureReason: string | null;
	createdAt: string;
};

const CURRENCIES = ['USD', 'EUR', 'UAH'] as const;

export default function WalletsPage() {
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [history, setHistory] = useState<TransferRow[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [currency, setCurrency] = useState<string>('USD');
	const [busy, setBusy] = useState(false);
	const [depositAmount, setDepositAmount] = useState('');
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const { lastHistoryAt } = useLiveTransfers();

	function copyWalletId(id: string) {
		void navigator.clipboard.writeText(id).then(() => {
			setCopiedId(id);
			window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
		});
	}

	const active = useMemo(
		() => wallets.find((w) => w.id === activeId) ?? wallets[0] ?? null,
		[wallets, activeId],
	);

	const reloadWallets = useCallback(async () => {
		const res = await fetch('/api/wallets');
		if (res.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			setLoadError(body.error ?? 'Не вдалося завантажити гаманці');
			return;
		}
		setLoadError(null);
		const list = (await res.json()) as Wallet[];
		setWallets(list);
		setActiveId((prev) => {
			if (prev && list.some((w) => w.id === prev)) return prev;
			return list[0]?.id ?? null;
		});
	}, []);

	const reloadHistory = useCallback(async (walletId: string) => {
		const res = await fetch(`/api/transfers?walletId=${encodeURIComponent(walletId)}`);
		if (!res.ok) {
			return;
		}
		setHistory(await res.json());
	}, []);

	useEffect(() => {
		void reloadWallets();
	}, [reloadWallets]);

	useEffect(() => {
		if (!active?.id) {
			setHistory([]);
			return;
		}
		void reloadHistory(active.id);
		void reloadWallets();
		const t = window.setInterval(() => {
			void reloadHistory(active.id);
			void reloadWallets();
		}, 3000);
		return () => window.clearInterval(t);
	}, [active?.id, reloadHistory, reloadWallets, lastHistoryAt]);

	async function onCreate(e: FormEvent) {
		e.preventDefault();
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch('/api/wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currency }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? 'Не вдалося створити гаманець');
			}
			await reloadWallets();
			setActiveId(data.id);
		} catch (err) {
			setActionError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function onDeposit() {
		if (!active) return;
		setActionError(null);
		const amount = Number(depositAmount);
		if (!Number.isFinite(amount) || amount <= 0) {
			setActionError('Сума поповнення має бути > 0');
			return;
		}
		setBusy(true);
		try {
			const res = await fetch(`/api/wallets/${active.id}/deposit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? 'Не вдалося поповнити');
			}
			setDepositAmount('');
			await reloadWallets();
		} catch (err) {
			setActionError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	const existingCurrencies = new Set(wallets.map((w) => w.currency.toUpperCase()));

	return (
		<main style={{ maxWidth: 640, margin: '32px auto', padding: 16 }}>
			<h1>Мої гаманці</h1>
			{loadError && <p style={{ color: 'crimson' }}>{loadError}</p>}
			{actionError && <p style={{ color: 'crimson' }}>{actionError}</p>}

			{wallets.length > 0 && (
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
					{wallets.map((w) => {
						const selected = w.id === active?.id;
						return (
							<div
								key={w.id}
								style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}
							>
								<button
									type="button"
									onClick={() => setActiveId(w.id)}
									style={{
										padding: '8px 14px',
										border: selected ? '2px solid #222' : '1px solid #ccc',
										borderRight: 'none',
										background: selected ? '#111' : '#fff',
										color: selected ? '#fff' : '#222',
										cursor: 'pointer',
									}}
								>
									{w.currency} · {w.available ?? w.balance ?? '—'}
								</button>
								<button
									type="button"
									title={w.id}
									onClick={() => copyWalletId(w.id)}
									style={{
										padding: '8px 10px',
										border: selected ? '2px solid #222' : '1px solid #ccc',
										background: selected ? '#333' : '#f7f7f7',
										color: selected ? '#fff' : '#333',
										cursor: 'pointer',
										fontSize: 12,
									}}
								>
									{copiedId === w.id ? '✓' : '⧉'}
								</button>
							</div>
						);
					})}
				</div>
			)}

			{!loadError && wallets.length === 0 && (
				<p>Гаманців поки немає — створіть перший нижче.</p>
			)}

			{active && (
				<section
					style={{
						border: '1px solid #e5e5e5',
						padding: 16,
						marginBottom: 24,
					}}
				>
					<div style={{ marginBottom: 12 }}>
						<strong>{active.currency}</strong>
						<div style={{ fontSize: 22, marginTop: 4 }}>
							{active.available ?? active.balance ?? '—'}
						</div>
						{active.held != null && Number(active.held) > 0 && (
							<div style={{ color: '#888', fontSize: 13 }}>hold: {active.held}</div>
						)}
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								marginTop: 8,
								flexWrap: 'wrap',
							}}
						>
							<code style={{ color: '#555', fontSize: 12 }}>{active.id}</code>
							<button
								type="button"
								onClick={() => copyWalletId(active.id)}
								style={{ fontSize: 12 }}
							>
								{copiedId === active.id ? 'Скопійовано' : 'Копіювати ID'}
							</button>
						</div>
					</div>

					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
						<a href={`/transfer?from=${active.id}`}>
							<button type="button">Зробити переказ</button>
						</a>
						<input
							type="number"
							step="0.01"
							min="0.01"
							placeholder="Сума поповнення"
							value={depositAmount}
							onChange={(e) => setDepositAmount(e.target.value)}
						/>
						<button type="button" disabled={busy} onClick={() => void onDeposit()}>
							Поповнити
						</button>
					</div>

					<h2 style={{ fontSize: 16, marginBottom: 8 }}>Історія переказів</h2>
					{history.length === 0 ? (
						<p style={{ color: '#888' }}>Поки немає переказів по цьому гаманцю.</p>
					) : (
						<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
							{history.map((t) => {
								const sent = t.fromWalletId === active.id;
								return (
									<li
										key={t.id}
										style={{
											padding: '10px 0',
											borderTop: '1px solid #f0f0f0',
											fontSize: 14,
										}}
									>
										<div style={{ fontWeight: 600 }}>
											{sent ? '→ Відправлено' : '← Отримано'} · {t.status}
										</div>
										<div>
											{sent
												? `${t.amount} ${t.currency} → ${t.amountTo} ${t.toCurrency}`
												: `${t.amountTo} ${t.toCurrency} (з ${t.amount} ${t.currency})`}
										</div>
										<div style={{ color: '#888', fontSize: 12 }}>
											{sent ? `до ${t.toIdentifier || t.toWalletId}` : `з ${t.fromWalletId.slice(0, 8)}…`}
											{' · '}
											{new Date(t.createdAt).toLocaleString()}
											{t.failureReason ? ` · ${t.failureReason}` : ''}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			)}

			<section>
				<h2 style={{ fontSize: 16 }}>Створити гаманець</h2>
				<form onSubmit={onCreate} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<select
						value={currency}
						onChange={(e) => setCurrency(e.target.value)}
						disabled={busy}
					>
						{CURRENCIES.map((c) => (
							<option key={c} value={c} disabled={existingCurrencies.has(c)}>
								{c}
								{existingCurrencies.has(c) ? ' (вже є)' : ''}
							</option>
						))}
					</select>
					<button
						type="submit"
						disabled={busy || existingCurrencies.has(currency.toUpperCase())}
					>
						{busy ? '…' : 'Створити'}
					</button>
				</form>
			</section>
		</main>
	);
}
