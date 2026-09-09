'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatNotificationText } from './notificationCopy';
import { useDismissibleNotifications, useLiveTransfers } from './LiveTransfersProvider';

type Me = { userId: string; email: string; role: string };

const HIDDEN = new Set(['/login', '/register']);

export function AppHeader() {
	const pathname = usePathname();
	const router = useRouter();
	const [me, setMe] = useState<Me | null>(null);
	const [open, setOpen] = useState(false);
	const { connected, meUserId } = useLiveTransfers();
	const { unread, markAll, all } = useDismissibleNotifications();

	useEffect(() => {
		if (HIDDEN.has(pathname)) {
			setMe(null);
			return;
		}
		void (async () => {
			const res = await fetch('/api/me');
			if (!res.ok) {
				setMe(null);
				return;
			}
			setMe(await res.json());
		})();
	}, [pathname]);

	if (HIDDEN.has(pathname) || !me) {
		return null;
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		setMe(null);
		router.push('/login');
		router.refresh();
	}

	return (
		<header
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 16,
				padding: '12px 20px',
				borderBottom: '1px solid #e5e5e5',
				background: '#fafafa',
				position: 'relative',
			}}
		>
			<nav style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
				<a href="/wallets" style={{ fontWeight: 600, textDecoration: 'none', color: '#111' }}>
					P2P Ledger
				</a>
				<a href="/wallets" style={{ color: '#444', textDecoration: 'none' }}>
					Гаманці
				</a>
				<a href="/transfer" style={{ color: '#444', textDecoration: 'none' }}>
					Переказ
				</a>
			</nav>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
				<span style={{ fontSize: 12, color: connected ? '#2a7' : '#999' }}>
					{connected ? '● live' : '○ offline'}
				</span>
				<button
					type="button"
					onClick={() => {
						setOpen((v) => {
							const next = !v;
							if (v && !next) {
								markAll();
							}
							return next;
						});
					}}
					style={{ position: 'relative' }}
				>
					Сповіщення
					{unread.length > 0 && (
						<span
							style={{
								marginLeft: 6,
								background: '#c00',
								color: '#fff',
								borderRadius: 10,
								padding: '0 6px',
								fontSize: 12,
							}}
						>
							{unread.length}
						</span>
					)}
				</button>
				<span style={{ color: '#555', fontSize: 14 }}>{me.email}</span>
				<button type="button" onClick={() => void logout()}>
					Вийти
				</button>
			</div>
			{open && (
				<div
					style={{
						position: 'absolute',
						right: 20,
						top: '100%',
						marginTop: 4,
						width: 360,
						maxHeight: 420,
						overflow: 'auto',
						background: '#fff',
						border: '1px solid #ddd',
						boxShadow: '0 8px 24px rgba(0,0,0,.08)',
						zIndex: 20,
						padding: 8,
					}}
				>
					{all.length === 0 ? (
						<p style={{ color: '#888', fontSize: 13, margin: 8 }}>Поки немає сповіщень</p>
					) : (
						<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
							{all.slice(0, 20).map((e) => {
								const isUnread = unread.some((u) => u.eventId === e.eventId);
								const copy = formatNotificationText(e, meUserId ?? me.userId);
								return (
									<li
										key={e.eventId}
										style={{
											padding: '10px 10px',
											borderBottom: '1px solid #f0f0f0',
											fontSize: 13,
											background: isUnread ? '#f7fafc' : 'transparent',
											borderLeft:
												copy.kind === 'fail'
													? '3px solid #c00'
													: copy.kind === 'ok'
														? '3px solid #2a7'
														: '3px solid transparent',
										}}
									>
										<div style={{ fontWeight: 600 }}>{copy.title}</div>
										<div style={{ color: '#555', marginTop: 4 }}>{copy.body}</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</header>
	);
}
