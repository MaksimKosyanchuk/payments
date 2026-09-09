'use client';

import { formatNotificationText } from './notificationCopy';
import { useLiveTransfers } from './LiveTransfersProvider';

/** Floating toasts — only user-facing notifications (not saga steps). */
export function NotificationToasts() {
	const { toasts, dismissToast, meUserId } = useLiveTransfers();

	if (toasts.length === 0) {
		return null;
	}

	return (
		<div
			style={{
				position: 'fixed',
				right: 16,
				bottom: 16,
				zIndex: 1000,
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				maxWidth: 380,
				pointerEvents: 'none',
			}}
			aria-live="polite"
		>
			{toasts.map((t) => {
				const copy = formatNotificationText(t, meUserId);
				const bg = copy.kind === 'fail' ? '#5c1a1a' : '#14532d';
				return (
					<div
						key={t.eventId}
						style={{
							pointerEvents: 'auto',
							background: bg,
							color: '#fff',
							padding: '12px 14px',
							borderRadius: 8,
							boxShadow: '0 8px 24px rgba(0,0,0,.25)',
							fontSize: 14,
						}}
					>
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
							<strong>{copy.title}</strong>
							<button
								type="button"
								onClick={() => dismissToast(t.eventId)}
								style={{
									background: 'transparent',
									border: 0,
									color: '#ccc',
									cursor: 'pointer',
								}}
							>
								×
							</button>
						</div>
						<div style={{ opacity: 0.92, marginTop: 6, fontSize: 13, lineHeight: 1.35 }}>
							{copy.body}
						</div>
					</div>
				);
			})}
		</div>
	);
}
