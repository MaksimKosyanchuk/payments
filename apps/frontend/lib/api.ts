import { randomBytes } from 'node:crypto';

const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? 'http://localhost:3001';
const PAYMENTS_URL = process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3002';

function traceparent(): string {
	return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

function requestInit(init?: RequestInit): RequestInit {
	const headers = new Headers(init?.headers);
	headers.set('Content-Type', 'application/json');
	if (!headers.has('traceparent')) {
		headers.set('traceparent', traceparent());
	}
	return { ...init, headers };
}

export async function ledgerFetch(path: string, init?: RequestInit) {
	const res = await fetch(`${LEDGER_URL}${path}`, {
		...requestInit(init),
		cache: 'no-store',
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Ledger API ${res.status}: ${body}`);
	}
	return res.json();
}

export async function paymentsFetch(path: string, init?: RequestInit) {
	const res = await fetch(`${PAYMENTS_URL}${path}`, {
		...requestInit(init),
		cache: 'no-store',
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Payments API ${res.status}: ${body}`);
	}
	return res.json();
}
