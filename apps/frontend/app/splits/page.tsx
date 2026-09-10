'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveTransfers } from '../components/LiveTransfersProvider';

type Wallet = { id: string; currency: string; available?: string; balance?: string };

type Share = {
	id: string;
	payerId: string;
	payerEmail: string | null;
	amount: number;
	status: string;
	transferId: string | null;
};

type Bill = {
	id: string;
	initiatorId: string;
	initiatorEmail: string | null;
	toWalletId: string;
	total: number;
	currency: string;
	status: string;
	title: string | null;
	dueAt: string | null;
	createdAt: string;
	shares: Share[];
};

type Me = { userId: string; email: string };

type PayTarget = { bill: Bill; share: Share };

export default function SplitsPage() {
	const [me, setMe] = useState<Me | null>(null);
	const [bills, setBills] = useState<Bill[]>([]);
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const [title, setTitle] = useState('');
	const [total, setTotal] = useState('100');
	const [toWalletId, setToWalletId] = useState('');
	const [emails, setEmails] = useState('');
	const [dueAt, setDueAt] = useState('');

	const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
	const [payWalletId, setPayWalletId] = useState('');

	const { splitEvents } = useLiveTransfers();
	const processedSplitEvents = useRef(new Set<string>());

	const reload = useCallback(async () => {
		const [meRes, billsRes, walletsRes] = await Promise.all([
			fetch('/api/me'),
			fetch('/api/splits'),
			fetch('/api/wallets'),
		]);
		if (!meRes.ok) {
			window.location.href = '/login';
			return;
		}
		setMe(await meRes.json());
		if (billsRes.ok) setBills(await billsRes.json());
		if (walletsRes.ok) {
			const list = (await walletsRes.json()) as Wallet[];
			setWallets(list);
			setToWalletId((prev) => prev || list[0]?.id || '');
		}
	}, []);

	useEffect(() => {
		for (const event of splitEvents) {
			if (processedSplitEvents.current.has(event.eventId)) {
				continue;
			}

			processedSplitEvents.current.add(event.eventId);

			if (event.type === 'SplitBillCreated') {
				void fetch(`/api/splits/${event.billId}`)
					.then(async (res) => {
						if (!res.ok) return;
						const bill = (await res.json()) as Bill;

						setBills((prev) => {
							if (prev.some((item) => item.id === bill.id)) {
								return prev;
							}

							return [bill, ...prev];
						});
					})
					.catch(() => undefined);

				continue;
			}

			setBills((prev) =>
				prev.map((bill) => {
					if (bill.id !== event.billId) {
						return bill;
					}

					const shares = event.shareId
						? bill.shares.map((share) =>
								share.id === event.shareId
									? {
											...share,
											status:
												event.type === 'SplitSharePaid'
													? 'Paid'
													: event.type === 'SplitShareOverdue'
														? 'Overdue'
														: share.status,
										}
									: share,
							)
						: bill.shares;

					return {
						...bill,
						shares,
						status:
							event.type === 'SplitBillSettled'
								? 'Settled'
								: bill.status,
					};
				}),
			);
		}
	}, [splitEvents]);

	useEffect(() => {
		void reload();
	}, [reload]);

	useEffect(() => {
		if (!payTarget || wallets.length === 0) return;
		const preferred =
			wallets.find(
				(w) => w.currency.toUpperCase() === payTarget.bill.currency.toUpperCase(),
			) ?? wallets[0];
		setPayWalletId(preferred.id);
	}, [payTarget, wallets]);

	const receiveWallet = useMemo(
		() => wallets.find((w) => w.id === toWalletId) ?? null,
		[wallets, toWalletId],
	);

	const selectedPayWallet = useMemo(
		() => wallets.find((w) => w.id === payWalletId) ?? null,
		[wallets, payWalletId],
	);

	async function onCreate(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setInfo(null);
		setBusy(true);

		try {
			if (!toWalletId) {
				throw new Error('Оберіть гаманець для зарахування');
			}

			const participants = emails
				.split(/[,;\n]+/)
				.map((s) => s.trim())
				.filter(Boolean)
				.map((email) => ({ email }));

			if (participants.length === 0) {
				throw new Error('Додайте хоча б одного учасника (email)');
			}

			const idempotencyKey = crypto.randomUUID();

			const res = await fetch('http://localhost:3002/splits', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'idempotency-Key': idempotencyKey,
				},
				body: JSON.stringify({
					title: title || undefined,
					total: Number(total),
					initiatorId: me?.userId,
					initiatorEmail: me?.email,
					toWalletId,
					dueAt: dueAt || undefined,
					participants,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error ?? 'Не вдалося створити');
			}

			setBills((prev) => [data, ...prev]);

			setTitle('');
			setEmails('');

			setInfo(
				`Рахунок створено: учасники скинуть на ${
					receiveWallet?.currency ?? ''
				} ${toWalletId.slice(0, 8)}…`,
			);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function confirmPay() {
		if (!payTarget || !payWalletId) return;
		setError(null);
		setInfo(null);
		setBusy(true);
		try {
			const res = await fetch(
				`/api/splits/${payTarget.bill.id}/shares/${payTarget.share.id}/pay`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ fromWalletId: payWalletId }),
				},
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Не вдалося оплатити');
			setPayTarget(null);

			const fxNote =
				data.debitCurrency &&
				data.creditCurrency &&
				data.debitCurrency !== data.creditCurrency
					? ` Списано ≈ ${data.debitAmount} ${data.debitCurrency} → ${data.creditAmount} ${data.creditCurrency} (FX ${data.fxRate}).`
					: '';
			if (data.transferId && data.transferStatus !== 'Completed') {
				setInfo(
					`Переказ створено (${String(data.transferId).slice(0, 8)}…).${fxNote} Статус оновиться автоматично.`,
				);
			} else {
				setInfo(`Оплату прийнято.${fxNote}`);
			}
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<main style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
			<h1>Спільні рахунки</h1>
			<p>
				<a href="/wallets">← Гаманці</a>
			</p>
			{error && <p style={{ color: 'crimson' }}>{error}</p>}
			{info && <p style={{ color: '#15803d' }}>{info}</p>}

			<section
				style={{
					border: '1px solid #e5e5e5',
					padding: 16,
					marginBottom: 24,
				}}
			>
				<h2 style={{ fontSize: 16 }}>Створити рахунок</h2>
				<p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
					Ви лише отримуєте: учасники скидують частки на обраний вами гаманець.
					Вас у списку платників немає.
				</p>
				<form onSubmit={onCreate} style={{ display: 'grid', gap: 10 }}>
					<label>
						Назва
						<input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Вечеря"
							style={{ display: 'block', width: '100%' }}
						/>
					</label>
					<label>
						Сума (всього, порівну між учасниками)
						<input
							type="number"
							step="0.01"
							min="0.01"
							value={total}
							onChange={(e) => setTotal(e.target.value)}
							required
							style={{ display: 'block', width: '100%' }}
						/>
					</label>
					<label>
						Куди капнуть гроші (ваш гаманець)
						<select
							value={toWalletId}
							onChange={(e) => setToWalletId(e.target.value)}
							required
							style={{ display: 'block', width: '100%' }}
						>
							{wallets.length === 0 ? (
								<option value="">Немає гаманців</option>
							) : (
								wallets.map((w) => (
									<option key={w.id} value={w.id}>
										{w.currency} · available {w.available ?? w.balance ?? '—'} ·{' '}
										{w.id.slice(0, 8)}
									</option>
								))
							)}
						</select>
					</label>
					{receiveWallet && (
						<p style={{ fontSize: 13, color: '#555', margin: 0 }}>
							Валюта рахунку = {receiveWallet.currency} (з гаманця).
						</p>
					)}
					<label>
						Учасники (email через кому)
						<textarea
							value={emails}
							onChange={(e) => setEmails(e.target.value)}
							rows={3}
							placeholder="alice@example.com, bob@example.com"
							required
							style={{ display: 'block', width: '100%' }}
						/>
					</label>
					<label>
						Термін оплати (опційно)
						<input
							type="datetime-local"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
							style={{ display: 'block', width: '100%' }}
						/>
					</label>
					<button type="submit" disabled={busy || !toWalletId}>
						{busy ? '…' : 'Створити'}
					</button>
				</form>
			</section>

			{payTarget && (
				<section
					style={{
						border: '2px solid #222',
						padding: 16,
						marginBottom: 24,
						background: '#fafafa',
					}}
				>
					<h2 style={{ fontSize: 16, marginTop: 0 }}>Оплата частки</h2>
					<p style={{ fontSize: 14 }}>
						{payTarget.bill.title || 'Рахунок'}: сплатити{' '}
						<strong>
							{payTarget.share.amount} {payTarget.bill.currency}
						</strong>{' '}
						на гаманець ініціатора ({payTarget.bill.toWalletId.slice(0, 8)}…)
					</p>
					<label>
						З гаманця
						<select
							value={payWalletId}
							onChange={(e) => setPayWalletId(e.target.value)}
							style={{ display: 'block', width: '100%', marginTop: 4 }}
						>
							{wallets.map((w) => (
								<option key={w.id} value={w.id}>
									{w.currency} · available {w.available ?? w.balance ?? '—'} ·{' '}
									{w.id.slice(0, 8)}
								</option>
							))}
						</select>
					</label>
					{selectedPayWallet &&
						selectedPayWallet.currency.toUpperCase() !==
							payTarget.bill.currency.toUpperCase() && (
							<p style={{ fontSize: 13, color: '#555' }}>
								Валюти різні: з {selectedPayWallet.currency} спишеться еквівалент
								через FX, ініціатор отримає {payTarget.share.amount}{' '}
								{payTarget.bill.currency}.
							</p>
						)}
					<div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
						<button
							type="button"
							disabled={busy || !payWalletId}
							onClick={() => void confirmPay()}
						>
							{busy ? '…' : 'Підтвердити оплату'}
						</button>
						<button type="button" disabled={busy} onClick={() => setPayTarget(null)}>
							Скасувати
						</button>
					</div>
				</section>
			)}

			<section>
				<h2 style={{ fontSize: 16 }}>Мої рахунки</h2>
				{bills.length === 0 ? (
					<p style={{ color: '#888' }}>Поки немає</p>
				) : (
					<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
						{bills.map((b) => {
							const myShare = me
								? b.shares.find((s) => s.payerId === me.userId)
								: null;
							const iAmInitiator = me?.userId === b.initiatorId;
							return (
								<li
									key={b.id}
									style={{
										borderTop: '1px solid #eee',
										padding: '14px 0',
									}}
								>
									<div style={{ fontWeight: 600 }}>
										{b.title || 'Рахунок'} · {b.total} {b.currency} · {b.status}
									</div>
									<div style={{ fontSize: 13, color: '#555' }}>
										ініціатор: {b.initiatorEmail || b.initiatorId.slice(0, 8)}
										{b.toWalletId
											? ` · на гаманець ${b.toWalletId.slice(0, 8)}…`
											: ''}
										{b.dueAt ? ` · до ${new Date(b.dueAt).toLocaleString()}` : ''}
									</div>
									<ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14 }}>
										{b.shares.map((s) => (
											<li key={s.id}>
												{s.payerEmail || s.payerId.slice(0, 8)} — {s.amount}{' '}
												{b.currency} — {s.status}
											</li>
										))}
									</ul>
									{myShare && myShare.status !== 'Paid' && !iAmInitiator && (
										<button
											type="button"
											disabled={busy}
											style={{ marginTop: 8 }}
											onClick={() => {
												setError(null);
												setInfo(null);
												setPayTarget({ bill: b, share: myShare });
											}}
										>
											Оплатити мою частку ({myShare.amount} {b.currency})
										</button>
									)}
									{iAmInitiator && (
										<p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
											Ви організатор — чекаєте перекази на обраний гаманець.
										</p>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</main>
	);
}
