const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? 'http://localhost:3001';
const PAYMENTS_URL = process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3002';

export async function ledgerFetch(path: string, init?: RequestInit) {
	const res = await fetch(`${LEDGER_URL}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
		cache: 'no-store',
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Payments API ${res.status}: ${body}`);
	}
	return res.json();
}
