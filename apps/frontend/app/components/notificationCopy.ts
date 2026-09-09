import type { LiveTransferEvent } from './LiveTransfersProvider';

/** Saga steps — only for transfer operation UI, not bell/toasts. */
export const PROGRESS_EVENT_TYPES = new Set([
	'TransferStarted',
	'TransferBalanceChecked',
	'TransferCaptured',
	'TransferCredited',
	'TransferCompleted',
	'TransferFailed',
]);

/** User-facing in-app notifications (bell + toasts). */
export const NOTIFY_EVENT_TYPES = new Set([
	'TransferCompleted',
	'TransferFailed',
]);

function shortId(id: string | null | undefined): string {
	if (!id) return '—';
	return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function money(amount: number | null, currency: string | null): string {
	if (amount == null) return 'кошти';
	return `${amount} ${currency ?? ''}`.trim();
}

/**
 * Human copy for in-app notifications (not saga step labels).
 * Example: «Вам переказали гроші з рахунку … (USD) на ваш гаманець (EUR)»
 */
export function formatNotificationText(
	e: LiveTransferEvent,
	meUserId: string | null,
): { title: string; body: string; kind: 'ok' | 'fail' | 'info' } {
	const isRecipient =
		!!meUserId && !!e.recipientOwnerId && e.recipientOwnerId === meUserId;
	const isSender =
		!!meUserId && !!e.initiatorId && e.initiatorId === meUserId;

	if (e.type === 'TransferFailed') {
		return {
			title: 'Переказ відхилено',
			body: e.failureReason
				? `Не вдалося надіслати ${money(e.amount, e.currency)}: ${e.failureReason}`
				: `Не вдалося надіслати ${money(e.amount, e.currency)} отримувачу ${e.toIdentifier || shortId(e.toWalletId)}`,
			kind: 'fail',
		};
	}

	if (e.type === 'TransferCompleted' || e.type === 'TransferCredited') {
		if (isRecipient && !isSender) {
			const fromCur = e.currency ? ` (${e.currency})` : '';
			const toCur = e.toCurrency ?? e.currency ?? '';
			return {
				title: 'Вам переказали гроші',
				body: `З рахунку ${shortId(e.fromWalletId)}${fromCur} на ваш гаманець${toCur ? ` ${toCur}` : ''} надійшло ${money(
					e.amountTo ?? e.amount,
					e.toCurrency ?? e.currency,
				)}`,
				kind: 'ok',
			};
		}
		return {
			title: 'Переказ виконано',
			body: `Ви надіслали ${money(e.amount, e.currency)} на ${
				e.toIdentifier || shortId(e.toWalletId)
			}${
				e.toCurrency && e.currency && e.toCurrency !== e.currency
					? ` (отримувач отримає ${money(e.amountTo, e.toCurrency)})`
					: ''
			}`,
			kind: 'ok',
		};
	}

	return {
		title: 'Сповіщення',
		body: e.type,
		kind: 'info',
	};
}
