'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Wallet = { id: string; currency: string; balance?: string; available?: string };

type ProgressEvent = {
	eventId: string;
	type: string;
	transferId: string;
	status: string | null;
	currentStep: string | null;
	failureReason: string | null;
	amount: number | null;
	currency: string | null;
	amountTo: number | null;
	toCurrency: string | null;
	occurredAt: string | null;
};

const STEPS = [
	{ type: 'TransferStarted', label: 'Починаємо відправку' },
	{ type: 'TransferBalanceChecked', label: 'Перевіряємо ваш баланс' },
	{ type: 'TransferCaptured', label: 'Списуємо гроші' },
	{ type: 'TransferCredited', label: 'Нараховуємо отримувачу' },
	{ type: 'TransferCompleted', label: 'Готово' },
] as const;

const WS_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_URL ?? 'http://localhost:3003';

export default function TransferPage() {
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [userId, setUserId] = useState<string | null>(null);
	const [fromWalletId, setFromWalletId] = useState('');
	const [toWalletIdentifier, setTo] = useState('');
	const [amount, setAmount] = useState('10');
	const [error, setError] = useState<string | null>(null);
	const [transferId, setTransferId] = useState<string | null>(null);
	const [finalStatus, setFinalStatus] = useState<string | null>(null);
	const [seenTypes, setSeenTypes] = useState<string[]>([]);
	const [failureReason, setFailureReason] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const selectedWallet = useMemo(
		() => wallets.find((w) => w.id === fromWalletId),
		[wallets, fromWalletId],
	);

	useEffect(() => {
		void (async () => {
			const [meRes, walletsRes] = await Promise.all([
				fetch('/api/me'),
				fetch('/api/wallets'),
			]);
			if (!meRes.ok) {
				setError('Увійдіть у систему');
				return;
			}
			const me = await meRes.json();
			setUserId(me.userId);
			if (walletsRes.ok) {
				const list = (await walletsRes.json()) as Wallet[];
				setWallets(list);
				if (list[0]) {
					setFromWalletId(list[0].id);
				}
			}
		})();
	}, []);

	useEffect(() => {
		if (!userId) {
			return;
		}
		let cancelled = false;
		const socket: Socket = io(`${WS_URL}/transfers`, {
			transports: ['websocket'],
		});
		socket.on('connect', () => {
			socket.emit('subscribe', {
				userId,
				...(transferId ? { transferId } : {}),
			});
		});
		socket.on('transfer.progress', (msg: ProgressEvent) => {
			if (transferId && msg.transferId !== transferId) {
				return;
			}
			if (!transferId) {
				setTransferId(msg.transferId);
			}
			setSeenTypes((prev) => (prev.includes(msg.type) ? prev : [...prev, msg.type]));
			if (msg.type === 'TransferCompleted') {
				setFinalStatus('Completed');
			}
			if (msg.type === 'TransferFailed') {
				setFinalStatus('Failed');
				setFailureReason(msg.failureReason);
			}
		});

		let poll: number | undefined;
		if (transferId) {
			poll = window.setInterval(() => {
				void (async () => {
					const snap = await fetch(`/api/transfers/${transferId}`);
					if (!snap.ok || cancelled) {
						return;
					}
					const t = await snap.json();
					if (t.status === 'Completed') {
						setFinalStatus('Completed');
						setSeenTypes((prev) =>
							Array.from(new Set([...prev, ...STEPS.map((s) => s.type)])),
						);
						if (poll) window.clearInterval(poll);
					}
					if (t.status === 'Failed') {
						setFinalStatus('Failed');
						setFailureReason(t.failureReason ?? null);
						if (poll) window.clearInterval(poll);
					}
				})();
			}, 800);
		}

		return () => {
			cancelled = true;
			if (poll) window.clearInterval(poll);
			socket.disconnect();
		};
	}, [transferId, userId]);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setFailureReason(null);
		setFinalStatus(null);
		setSeenTypes([]);
		setBusy(true);
		try {
			const idempotencyKey =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: `web-${Date.now()}`;
			const res = await fetch('/api/transfers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': idempotencyKey,
				},
				body: JSON.stringify({
					fromWalletId,
					toWalletIdentifier,
					amount: Number(amount),
					currency: selectedWallet?.currency ?? 'USD',
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? 'Не вдалося створити переказ');
			}
			setTransferId(data.id);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	const failed = finalStatus === 'Failed' || seenTypes.includes('TransferFailed');
	const done = finalStatus === 'Completed' || seenTypes.includes('TransferCompleted');

	return (
		<main style={{ maxWidth: 480, margin: '48px auto', padding: 16 }}>
			<h1>Переказ</h1>
			<p>
				<a href="/wallets">← Гаманці</a>
			</p>

			<form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
				<label>
					З гаманця
					<select
						value={fromWalletId}
						onChange={(e) => setFromWalletId(e.target.value)}
						required
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
						style={{ display: 'block', width: '100%' }}
					/>
				</label>
				<button type="submit" disabled={busy || !fromWalletId}>
					{busy ? 'Надсилаємо…' : 'Надіслати'}
				</button>
			</form>

			{error && <p style={{ color: 'crimson' }}>{error}</p>}

			{transferId && (
				<section style={{ marginTop: 32 }}>
					<h2>Статус</h2>
					<p style={{ color: '#666', fontSize: 14 }}>id: {transferId}</p>
					<ol style={{ listStyle: 'none', padding: 0 }}>
						{STEPS.map((step) => {
							const reached = seenTypes.includes(step.type);
							return (
								<li
									key={step.type}
									style={{
										padding: '8px 0',
										opacity: reached ? 1 : 0.4,
										fontWeight: reached ? 600 : 400,
									}}
								>
									{reached ? `✓ ${step.label}` : `○ ${step.label}`}
								</li>
							);
						})}
						{failed && (
							<li style={{ padding: '8px 0', fontWeight: 600, color: 'crimson' }}>
								✗ Відхилено{failureReason ? `: ${failureReason}` : ''}
							</li>
						)}
					</ol>
					{done && !failed && <p style={{ color: 'green' }}>Готово</p>}
				</section>
			)}
		</main>
	);
}
