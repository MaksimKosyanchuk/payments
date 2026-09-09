'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveTransfers } from '../components/LiveTransfersProvider';

type Wallet = { id: string; currency: string; balance?: string; available?: string };

type TransferSnap = {
	id: string;
	status: string;
	currentStep: string | null;
	failureReason: string | null;
};

const STEPS = [
	{ type: 'TransferStarted', label: 'Починаємо відправку' },
	{ type: 'TransferBalanceChecked', label: 'Перевіряємо ваш баланс' },
	{ type: 'TransferCaptured', label: 'Списуємо гроші' },
	{ type: 'TransferCredited', label: 'Нараховуємо отримувачу' },
	{ type: 'TransferCompleted', label: 'Готово' },
] as const;

function newIdempotencyKey(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Map DB status/step → reached outbox event types (source of truth when WS lags). */
function stepsFromSnapshot(t: TransferSnap): string[] {
	const step = t.currentStep ?? '';
	const status = t.status;
	const reached: string[] = ['TransferStarted'];

	const afterBalance =
		step === 'assertSenderCanPay' ||
		step === 'placeHold' ||
		step === 'captureHold' ||
		step === 'creditRecipient' ||
		step === 'complete' ||
		step === 'compensated:releaseHold' ||
		step === 'compensated:refundSender' ||
		status === 'Held' ||
		status === 'Credited' ||
		status === 'Completed' ||
		status === 'Compensating' ||
		status === 'Failed';

	if (afterBalance && step !== 'start' && step !== 'lockFx') {
		reached.push('TransferBalanceChecked');
	}
	// lockFx alone still only Started; after assert we have BalanceChecked
	if (step === 'lockFx' || step === 'start') {
		return ['TransferStarted'];
	}
	if (status === 'Pending' && (step === 'assertSenderCanPay' || step === 'lockFx')) {
		return step === 'assertSenderCanPay'
			? ['TransferStarted', 'TransferBalanceChecked']
			: ['TransferStarted'];
	}

	const afterCapture =
		step === 'captureHold' ||
		step === 'creditRecipient' ||
		step === 'complete' ||
		status === 'Credited' ||
		status === 'Completed' ||
		(status === 'Compensating' && step.includes('refund')) ||
		(status === 'Failed' &&
			(step.includes('credit') || step.includes('complete') || step.includes('refund')));

	// Held after placeHold — not captured yet
	if (status === 'Held' && step === 'placeHold') {
		return ['TransferStarted', 'TransferBalanceChecked'];
	}
	if (status === 'Held' && step === 'captureHold') {
		// may be mid-capture; show Captured only when Credited+ or Completed
		return ['TransferStarted', 'TransferBalanceChecked'];
	}
	if (afterCapture || status === 'Credited' || status === 'Completed') {
		if (!reached.includes('TransferBalanceChecked')) {
			reached.push('TransferBalanceChecked');
		}
		reached.push('TransferCaptured');
	}
	if (status === 'Credited' || status === 'Completed') {
		reached.push('TransferCredited');
	}
	if (status === 'Completed') {
		reached.push('TransferCompleted');
	}
	return Array.from(new Set(reached));
}

export default function TransferPageInner() {
	const search = useSearchParams();
	const fromQuery = search.get('from') ?? '';
	const { events, connected, subscribeTransfer } = useLiveTransfers();
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [fromWalletId, setFromWalletId] = useState(fromQuery);
	const [toWalletIdentifier, setTo] = useState('');
	const [amount, setAmount] = useState('10');
	const [error, setError] = useState<string | null>(null);
	const [transferId, setTransferId] = useState<string | null>(null);
	const [snap, setSnap] = useState<TransferSnap | null>(null);
	const [busy, setBusy] = useState(false);
	/** Stable for this payment attempt — regenerated only after terminal success/fail. */
	const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

	const selectedWallet = useMemo(
		() => wallets.find((w) => w.id === fromWalletId),
		[wallets, fromWalletId],
	);

	const transferEvents = useMemo(
		() => (transferId ? events.filter((e) => e.transferId === transferId) : []),
		[events, transferId],
	);

	const seenTypes = useMemo(() => {
		const fromSocket = transferEvents.map((e) => e.type);
		const fromSnap = snap ? stepsFromSnapshot(snap) : [];
		return Array.from(new Set([...fromSnap, ...fromSocket]));
	}, [transferEvents, snap]);

	const failedEvent = transferEvents.find((e) => e.type === 'TransferFailed');
	const failed =
		Boolean(failedEvent) || snap?.status === 'Failed' || seenTypes.includes('TransferFailed');
	const done =
		seenTypes.includes('TransferCompleted') || snap?.status === 'Completed';
	const failureReason = failedEvent?.failureReason ?? snap?.failureReason ?? null;
	const inFlight = Boolean(transferId) && !done && !failed;

	const refreshSnap = useCallback(async (id: string) => {
		const res = await fetch(`/api/transfers/${id}`);
		if (!res.ok) {
			return null;
		}
		const t = (await res.json()) as TransferSnap;
		setSnap(t);
		return t;
	}, []);

	const reloadWallets = useCallback(async () => {
		const walletsRes = await fetch('/api/wallets');
		if (!walletsRes.ok) {
			return;
		}
		const list = (await walletsRes.json()) as Wallet[];
		setWallets(list);
		setFromWalletId((prev) => {
			if (prev && list.some((w) => w.id === prev)) return prev;
			if (fromQuery && list.some((w) => w.id === fromQuery)) return fromQuery;
			return list[0]?.id ?? '';
		});
	}, [fromQuery]);

	useEffect(() => {
		void (async () => {
			const meRes = await fetch('/api/me');
			if (!meRes.ok) {
				setError('Увійдіть у систему');
				return;
			}
			await reloadWallets();
		})();
	}, [fromQuery, reloadWallets]);

	useEffect(() => {
		if (transferId) {
			subscribeTransfer(transferId);
		}
	}, [transferId, subscribeTransfer]);

	useEffect(() => {
		if (!transferId) {
			return;
		}
		void refreshSnap(transferId);
		const poll = window.setInterval(() => {
			void (async () => {
				const t = await refreshSnap(transferId);
				if (t && (t.status === 'Completed' || t.status === 'Failed')) {
					window.clearInterval(poll);
					// Ledger may settle slightly after status flips — refresh balances.
					await reloadWallets();
					window.setTimeout(() => void reloadWallets(), 400);
				}
			})();
		}, 700);
		return () => window.clearInterval(poll);
	}, [transferId, refreshSnap, reloadWallets]);

	// After terminal state — new key + refresh sender balance in the dropdown.
	useEffect(() => {
		if (done || failed) {
			idempotencyKeyRef.current = newIdempotencyKey();
			void reloadWallets();
		}
	}, [done, failed, reloadWallets]);

	// Hold/capture also changes available — refresh mid-flight when those steps appear.
	useEffect(() => {
		if (
			seenTypes.includes('TransferCaptured') ||
			seenTypes.includes('TransferBalanceChecked') ||
			snap?.status === 'Held'
		) {
			void reloadWallets();
		}
	}, [seenTypes, snap?.status, reloadWallets]);
	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (inFlight || busy) {
			return;
		}
		setError(null);
		// Do NOT clear transferId / rotate key here — retries must reuse the same key.
		setBusy(true);
		try {
			const res = await fetch('/api/transfers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': idempotencyKeyRef.current,
				},
				body: JSON.stringify({
					fromWalletId,
					toWalletIdentifier,
					amount: Number(amount),
					currency: selectedWallet?.currency ?? 'USD',
					idempotencyKey: idempotencyKeyRef.current,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? 'Не вдалося створити переказ');
			}
			setTransferId(data.id);
			await refreshSnap(data.id);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	function startNewTransfer() {
		setTransferId(null);
		setSnap(null);
		setError(null);
		idempotencyKeyRef.current = newIdempotencyKey();
	}

	return (
		<main style={{ maxWidth: 480, margin: '48px auto', padding: 16 }}>
			<h1>Переказ</h1>
			<p>
				<a href="/wallets">← Гаманці</a>
				{' · '}
				<span style={{ color: connected ? '#2a7' : '#999', fontSize: 13 }}>
					{connected ? 'live' : 'offline'}
				</span>
			</p>

			<form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
				<label>
					З гаманця
					<select
						value={fromWalletId}
						onChange={(e) => setFromWalletId(e.target.value)}
						required
						disabled={inFlight}
						style={{ display: 'block', width: '100%' }}
					>
						{wallets.map((w) => (
							<option key={w.id} value={w.id}>
								{w.currency} · {w.available ?? w.balance ?? '?'} · {w.id.slice(0, 8)}
							</option>
						))}
					</select>
				</label>
				<label>
					Отримувач (email або wallet id)
					<input
						value={toWalletIdentifier}
						onChange={(e) => setTo(e.target.value)}
						required
						disabled={inFlight}
						style={{ display: 'block', width: '100%' }}
					/>
				</label>
				<label>
					Сума
					<input
						type="number"
						step="0.01"
						min="0.01"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						required
						disabled={inFlight}
						style={{ display: 'block', width: '100%' }}
					/>
				</label>
				<button type="submit" disabled={busy || !fromWalletId || inFlight}>
					{inFlight ? 'В процесі…' : busy ? 'Надсилаємо…' : 'Надіслати'}
				</button>
				{(done || failed) && (
					<button type="button" onClick={startNewTransfer}>
						Новий переказ
					</button>
				)}
			</form>

			{error && <p style={{ color: 'crimson' }}>{error}</p>}

			{transferId && (
				<section style={{ marginTop: 32 }}>
					<h2>Статус</h2>
					<p style={{ color: '#666', fontSize: 14 }}>
						id: {transferId}
						{snap?.status ? ` · ${snap.status}` : ''}
					</p>
					<ol style={{ listStyle: 'none', padding: 0 }}>
						{STEPS.map((step) => {
							const reached = seenTypes.includes(step.type);
							// After failure, incomplete steps stay muted grey; success steps stay green.
							const color = reached
								? '#15803d'
								: failed
									? '#d1d5db'
									: '#9ca3af';
							return (
								<li
									key={step.type}
									style={{
										padding: '8px 0',
										color,
										fontWeight: reached ? 600 : 400,
										background: reached ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
										paddingLeft: 8,
										borderRadius: 4,
									}}
								>
									{reached ? `✓ ${step.label}` : `○ ${step.label}`}
								</li>
							);
						})}
						{failed && (
							<li
								style={{
									padding: '8px 8px',
									fontWeight: 700,
									color: '#b91c1c',
									background: 'rgba(185, 28, 28, 0.1)',
									borderRadius: 4,
									marginTop: 4,
								}}
							>
								✗ Відхилено{failureReason ? `: ${failureReason}` : ''}
							</li>
						)}
					</ol>
					{done && !failed && (
						<p style={{ color: '#15803d', fontWeight: 600 }}>Готово</p>
					)}
				</section>
			)}
		</main>
	);
}
