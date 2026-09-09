import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ledgerUrl = process.env.LEDGER_URL ?? 'http://localhost:3001';
const paymentsUrl = process.env.PAYMENTS_URL ?? 'http://localhost:3002';
const notificationsUrl = process.env.NOTIFICATIONS_URL ?? 'http://localhost:3003';
const password = 'integration-password-123';

function decodeUser(token) {
	return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function request(base, path, options = {}) {
	const response = await fetch(`${base}${path}`, {
		...options,
		headers: {
			'content-type': 'application/json',
			...(options.headers ?? {}),
		},
	});
	const text = await response.text();
	let body = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	return { response, body };
}

async function expectStatus(base, path, status, options = {}) {
	const result = await request(base, path, options);
	assert.equal(
		result.response.status,
		status,
		`${path}: expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`,
	);
	return result.body;
}

async function register(label) {
	const email = `ci-${label}-${randomUUID()}@example.com`;
	const body = await expectStatus(ledgerUrl, '/auth/register', 201, {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});
	return {
		email,
		password,
		accessToken: body.accessToken,
		userId: decodeUser(body.accessToken).sub,
	};
}

async function login(user) {
	const body = await expectStatus(ledgerUrl, '/auth/login', 201, {
		method: 'POST',
		body: JSON.stringify({ email: user.email, password: user.password }),
	});
	return {
		...user,
		accessToken: body.accessToken,
		userId: decodeUser(body.accessToken).sub,
	};
}

async function createWallet(user, currency) {
	return expectStatus(ledgerUrl, '/wallets', 201, {
		method: 'POST',
		headers: { authorization: `Bearer ${user.accessToken}` },
		body: JSON.stringify({ currency }),
	});
}

async function wallet(user, walletId) {
	return expectStatus(ledgerUrl, `/wallets/${walletId}`, 200, {
		headers: { authorization: `Bearer ${user.accessToken}` },
	});
}

async function transfer(payload, key) {
	return expectStatus(paymentsUrl, '/transfers', 201, {
		method: 'POST',
		headers: { 'Idempotency-Key': key },
		body: JSON.stringify(payload),
	});
}

async function waitForTransfer(id) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		const result = await request(paymentsUrl, `/transfers/${id}`);
		assert.equal(result.response.status, 200, JSON.stringify(result.body));
		if (['Completed', 'Failed'].includes(result.body.status)) return result.body;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`transfer ${id} did not reach a terminal state`);
}

async function main() {
	const sender = await register('sender');
	const sameRecipient = await register('same-recipient');
	const fxRecipient = await register('fx-recipient');
	const admin = await register('admin');

	const senderWallet = await createWallet(sender, 'USD');
	const sameRecipientWallet = await createWallet(sameRecipient, 'USD');
	const fxRecipientWallet = await createWallet(fxRecipient, 'EUR');

	await expectStatus(ledgerUrl, `/wallets/${senderWallet.id}/deposit`, 201, {
		method: 'POST',
		headers: { authorization: `Bearer ${sender.accessToken}` },
		body: JSON.stringify({ amount: 100 }),
	});

	// IDOR regression: another user cannot read the sender wallet.
	await expectStatus(ledgerUrl, `/wallets/${senderWallet.id}`, 404, {
		headers: { authorization: `Bearer ${sameRecipient.accessToken}` },
	});

	// Same-currency transfer and event-log consistency.
	const same = await transfer(
		{
			fromWalletId: senderWallet.id,
			toWalletIdentifier: sameRecipient.email,
			amount: 10,
			currency: 'USD',
			initiatorId: sender.userId,
		},
		`ci-same-${randomUUID()}`,
	);
	const sameDone = await waitForTransfer(same.id);
	assert.equal(sameDone.status, 'Completed');

	// Cross-currency transfer uses the recipient's EUR wallet and the locked FX rate.
	const fx = await transfer(
		{
			fromWalletId: senderWallet.id,
			toWalletIdentifier: fxRecipient.email,
			amount: 20,
			currency: 'USD',
			initiatorId: sender.userId,
		},
		`ci-fx-${randomUUID()}`,
	);
	const fxDone = await waitForTransfer(fx.id);
	assert.equal(fxDone.status, 'Completed');
	assert.equal(fxDone.currency, 'USD');
	assert.equal(fxDone.toCurrency, 'EUR');
	assert.equal(Number(fxDone.amountTo), 18.4);

	// Concurrent duplicate requests with one idempotency key create one transfer row.
	const duplicateKey = `ci-duplicate-${randomUUID()}`;
	const duplicatePayload = {
		fromWalletId: senderWallet.id,
		toWalletIdentifier: sameRecipient.email,
		amount: 5,
		currency: 'USD',
		initiatorId: sender.userId,
	};
	const duplicateResponses = await Promise.all([
		transfer(duplicatePayload, duplicateKey),
		transfer(duplicatePayload, duplicateKey),
	]);
	assert.equal(duplicateResponses[0].id, duplicateResponses[1].id);
	assert.equal((await waitForTransfer(duplicateResponses[0].id)).status, 'Completed');

	// Concurrent spends cannot both complete when only one can be covered.
	const spendPayload = {
		fromWalletId: senderWallet.id,
		toWalletIdentifier: sameRecipient.email,
		amount: 60,
		currency: 'USD',
		initiatorId: sender.userId,
	};
	const spendResponses = await Promise.all([
		transfer(spendPayload, `ci-spend-a-${randomUUID()}`),
		transfer(spendPayload, `ci-spend-b-${randomUUID()}`),
	]);
	const spendResults = await Promise.all(spendResponses.map((item) => waitForTransfer(item.id)));
	assert.equal(spendResults.filter((item) => item.status === 'Completed').length, 1);
	assert.equal(spendResults.filter((item) => item.status === 'Failed').length, 1);

	const senderAfter = await wallet(sender, senderWallet.id);
	assert.ok(Number(senderAfter.available) >= 0);
	const senderEvents = await expectStatus(ledgerUrl, `/wallets/${senderWallet.id}/events`, 200, {
		headers: { authorization: `Bearer ${sender.accessToken}` },
	});
	assert.ok(senderEvents.some((event) => event.type === 'MoneyDeposited'));
	assert.ok(senderEvents.some((event) => event.type === 'HoldPlaced'));
	assert.ok(senderEvents.some((event) => event.type === 'HoldCaptured'));

	// Promote only the CI-created user, then verify the protected reconciliation API.
	execFileSync(
		'docker',
		[
			'compose',
			'exec',
			'-T',
			'ledger-db',
			'psql',
			'-U',
			'ledger',
			'-d',
			'ledger',
			'-c',
			`UPDATE users SET role = 'admin' WHERE email = '${admin.email}';`,
		],
		{ stdio: 'ignore' },
	);
	const adminUser = await login(admin);
	const reconciliation = await expectStatus(ledgerUrl, '/admin/reconciliation', 200, {
		headers: { authorization: `Bearer ${adminUser.accessToken}` },
	});
	assert.equal(reconciliation.journal.balanced, true);
	assert.equal(reconciliation.journal.debitTotal, reconciliation.journal.creditTotal);

	// Redis duplicate delivery is processed once by the notifications consumer.
	const duplicateEventId = `ci-event-${randomUUID()}`;
	const duplicateEventPayload = JSON.stringify({
		transferId: same.id,
		status: 'Completed',
		initiatorId: sender.userId,
	});
	for (let attempt = 0; attempt < 2; attempt += 1) {
		execFileSync(
			'docker',
			[
				'compose',
				'exec',
				'-T',
				'redis',
				'redis-cli',
				'XADD',
				'payments.events',
				'*',
				'eventId',
				duplicateEventId,
				'type',
				'TransferCompleted',
				'payload',
				duplicateEventPayload,
				'correlationId',
				same.id,
				'occurredAt',
				new Date().toISOString(),
				'schemaVersion',
				'1',
			],
			{ stdio: 'ignore' },
		);
	}

	// Notifications consumer must expose activity for the sender after the saga events are consumed.
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const activity = await request(notificationsUrl, '/activity/me', {
			headers: { authorization: `Bearer ${sender.accessToken}` },
		});
		const duplicateEvents =
			activity.body?.filter(
				(item) => item.eventId === `${duplicateEventId}:${sender.userId}`,
			) ?? [];
		if (
			activity.response.ok &&
			activity.body.some((item) => item.type === 'TransferCompleted') &&
			duplicateEvents.length === 1
		) {
			console.log('integration tests passed');
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error('notifications activity did not contain TransferCompleted');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
