'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { NOTIFY_EVENT_TYPES } from './notificationCopy';

export type LiveTransferEvent = {
	eventId: string;
	type: string;
	transferId: string;
	status: string | null;
	failureReason: string | null;
	amount: number | null;
	currency: string | null;
	amountTo: number | null;
	toCurrency: string | null;
	fromWalletId: string | null;
	toWalletId: string | null;
	toIdentifier: string | null;
	initiatorId: string | null;
	recipientOwnerId: string | null;
	occurredAt: string | null;
};

type LiveCtx = {
	/** All saga/progress events (for transfer operation UI). */
	events: LiveTransferEvent[];
	/** User-facing notifications only (Completed / Failed). */
	notifications: LiveTransferEvent[];
	toasts: LiveTransferEvent[];
	lastHistoryAt: number;
	connected: boolean;
	meUserId: string | null;
	dismissToast: (eventId: string) => void;
	refreshActivity: () => Promise<void>;
	subscribeTransfer: (transferId: string) => void;
};

const Ctx = createContext<LiveCtx>({
	events: [],
	notifications: [],
	toasts: [],
	lastHistoryAt: 0,
	connected: false,
	meUserId: null,
	dismissToast: () => undefined,
	refreshActivity: async () => undefined,
	subscribeTransfer: () => undefined,
});

const WS_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_URL ?? 'http://localhost:3003';

const HISTORY_TYPES = new Set([
	'TransferCaptured',
	'TransferCredited',
	'TransferCompleted',
	'TransferFailed',
]);

function normalizeEvent(
	raw: Partial<LiveTransferEvent> & { eventId?: string },
): LiveTransferEvent | null {
	const eventId = raw.eventId;
	if (!eventId) {
		return null;
	}
	return {
		eventId,
		type: raw.type ?? 'Unknown',
		transferId: raw.transferId ?? '',
		status: raw.status ?? null,
		failureReason: raw.failureReason ?? null,
		amount: typeof raw.amount === 'number' ? raw.amount : Number(raw.amount) || null,
		currency: raw.currency ?? null,
		amountTo: typeof raw.amountTo === 'number' ? raw.amountTo : Number(raw.amountTo) || null,
		toCurrency: raw.toCurrency ?? null,
		fromWalletId: raw.fromWalletId ?? null,
		toWalletId: raw.toWalletId ?? null,
		toIdentifier: raw.toIdentifier ?? null,
		initiatorId: raw.initiatorId ?? null,
		recipientOwnerId: raw.recipientOwnerId ?? null,
		occurredAt: raw.occurredAt ?? null,
	};
}

function mapActivityRow(row: {
	id: string;
	eventId: string;
	type: string;
	payload: Record<string, unknown>;
	createdAt: string;
}): LiveTransferEvent | null {
	const p = row.payload ?? {};
	return normalizeEvent({
		eventId: row.eventId || row.id,
		type: row.type,
		transferId: String(p.transferId ?? ''),
		status: (p.status as string) ?? null,
		failureReason: (p.failureReason as string) ?? null,
		amount: p.amount as number | null,
		currency: (p.currency as string) ?? null,
		amountTo: p.amountTo as number | null,
		toCurrency: (p.toCurrency as string) ?? null,
		fromWalletId: (p.fromWalletId as string) ?? null,
		toWalletId: (p.toWalletId as string) ?? null,
		toIdentifier: (p.toIdentifier as string) ?? null,
		initiatorId: (p.initiatorId as string) ?? null,
		recipientOwnerId: (p.recipientOwnerId as string) ?? null,
		occurredAt: row.createdAt ?? null,
	});
}

function mergeById(
	incoming: LiveTransferEvent[],
	prev: LiveTransferEvent[],
): LiveTransferEvent[] {
	const byId = new Map<string, LiveTransferEvent>();
	for (const e of [...incoming, ...prev]) {
		if (!byId.has(e.eventId)) {
			byId.set(e.eventId, e);
		}
	}
	return Array.from(byId.values()).slice(0, 50);
}

export function LiveTransfersProvider({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [events, setEvents] = useState<LiveTransferEvent[]>([]);
	const [notifications, setNotifications] = useState<LiveTransferEvent[]>([]);
	const [toasts, setToasts] = useState<LiveTransferEvent[]>([]);
	const [lastHistoryAt, setLastHistoryAt] = useState(0);
	const [connected, setConnected] = useState(false);
	const [meUserId, setMeUserId] = useState<string | null>(null);
	const socketRef = useRef<Socket | null>(null);
	const seenToastIds = useRef(new Set<string>());

	const pushEvent = useCallback((raw: Partial<LiveTransferEvent>, opts?: { toast?: boolean }) => {
		const msg = normalizeEvent(raw);
		if (!msg) {
			return;
		}

		// Always keep progress timeline for transfer page.
		setEvents((prev) => mergeById([msg], prev));

		if (HISTORY_TYPES.has(msg.type)) {
			setLastHistoryAt(Date.now());
		}

		// In-app notifications: only terminal user-facing events.
		if (!NOTIFY_EVENT_TYPES.has(msg.type)) {
			return;
		}

		setNotifications((prev) => mergeById([msg], prev));

		if (opts?.toast !== false && !seenToastIds.current.has(msg.eventId)) {
			seenToastIds.current.add(msg.eventId);
			setToasts((prev) => [msg, ...prev].slice(0, 5));
			window.setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.eventId !== msg.eventId));
			}, 7000);
		}
	}, []);

	const dismissToast = useCallback((eventId: string) => {
		setToasts((prev) => prev.filter((t) => t.eventId !== eventId));
	}, []);

	const subscribeTransfer = useCallback((transferId: string) => {
		socketRef.current?.emit('subscribe', { transferId });
	}, []);

	const refreshActivity = useCallback(async () => {
		const res = await fetch('/api/activity');
		if (!res.ok) {
			return;
		}
		const rows = (await res.json()) as Array<{
			id: string;
			eventId: string;
			type: string;
			payload: Record<string, unknown>;
			createdAt: string;
		}>;
		const mapped = rows.map(mapActivityRow).filter(Boolean) as LiveTransferEvent[];
		for (const e of mapped) {
			seenToastIds.current.add(e.eventId);
		}
		setEvents((prev) => mergeById(mapped, prev));
		setNotifications((prev) =>
			mergeById(
				mapped.filter((e) => NOTIFY_EVENT_TYPES.has(e.type)),
				prev,
			),
		);
	}, []);

	const bindSocketHandlers = useCallback(
		(socket: Socket) => {
			socket.off('transfer.progress');
			socket.off('transfer.history');
			socket.off('notification');
			socket.on('transfer.progress', (msg: LiveTransferEvent) => {
				// Progress for operation UI; toast only if notify-type.
				pushEvent(msg, { toast: NOTIFY_EVENT_TYPES.has(msg.type) });
			});
			socket.on('notification', (msg: LiveTransferEvent) => {
				pushEvent(msg, { toast: NOTIFY_EVENT_TYPES.has(msg.type) });
			});
			socket.on('transfer.history', (msg: LiveTransferEvent) => {
				if (msg) {
					pushEvent(msg, { toast: false });
				}
				setLastHistoryAt(Date.now());
			});
		},
		[pushEvent],
	);

	const connectSocket = useCallback(async () => {
		const tokenRes = await fetch('/api/ws-token');
		if (!tokenRes.ok) {
			socketRef.current?.disconnect();
			socketRef.current = null;
			setConnected(false);
			return;
		}
		const { accessToken } = (await tokenRes.json()) as { accessToken: string };

		if (socketRef.current?.connected) {
			bindSocketHandlers(socketRef.current);
			return;
		}
		socketRef.current?.disconnect();

		const socket = io(`${WS_URL}/transfers`, {
			transports: ['websocket', 'polling'],
			auth: { token: accessToken },
			reconnection: true,
			reconnectionAttempts: 30,
			reconnectionDelay: 800,
		});
		socketRef.current = socket;

		socket.on('connect', () => {
			setConnected(true);
			socket.emit('subscribe', {});
		});
		socket.on('disconnect', () => setConnected(false));
		socket.on('connect_error', () => setConnected(false));
		bindSocketHandlers(socket);
	}, [bindSocketHandlers]);

	useEffect(() => {
		if (pathname === '/login' || pathname === '/register') {
			socketRef.current?.disconnect();
			socketRef.current = null;
			setConnected(false);
			setEvents([]);
			setNotifications([]);
			setToasts([]);
			setMeUserId(null);
			seenToastIds.current.clear();
			return;
		}

		void (async () => {
			const me = await fetch('/api/me');
			if (!me.ok) {
				return;
			}
			const body = (await me.json()) as { userId: string };
			setMeUserId(body.userId);
			await refreshActivity();
			await connectSocket();
		})();
	}, [pathname, refreshActivity, connectSocket]);

	useEffect(() => {
		return () => {
			socketRef.current?.disconnect();
			socketRef.current = null;
		};
	}, []);

	const value = useMemo(
		() => ({
			events,
			notifications,
			toasts,
			lastHistoryAt,
			connected,
			meUserId,
			dismissToast,
			refreshActivity,
			subscribeTransfer,
		}),
		[
			events,
			notifications,
			toasts,
			lastHistoryAt,
			connected,
			meUserId,
			dismissToast,
			refreshActivity,
			subscribeTransfer,
		],
	);

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveTransfers() {
	return useContext(Ctx);
}

export function useDismissibleNotifications() {
	const { notifications } = useLiveTransfers();
	const [seen, setSeen] = useState<Set<string>>(new Set());
	const unread = notifications.filter((e) => !seen.has(e.eventId));
	const markAll = useCallback(() => {
		setSeen(new Set(notifications.map((e) => e.eventId)));
	}, [notifications]);
	return { unread, markAll, all: notifications };
}
