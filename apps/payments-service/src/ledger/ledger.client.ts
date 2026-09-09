import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from './circuit-breaker';
import { getTraceparent } from '../observability/trace-context';

export class LedgerHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
		this.name = 'LedgerHttpError';
	}
}

export interface LedgerHold {
	id: string;
	walletId: string;
	amount: string;
	currency: string;
	status: string;
	sagaId: string | null;
}

export interface LedgerCreditResult {
	walletId: string;
	balance: string;
	currency: string;
	commandId: string;
}

export interface LedgerWalletView {
	id: string;
	ownerId: string;
	currency: string;
	available: string;
	held: string;
	balance: string;
	asOfVersion: number;
}

@Injectable()
export class LedgerClient {
	private readonly logger = new Logger(LedgerClient.name);
	private readonly baseUrl: string;
	private readonly serviceKey: string;
	private readonly breaker: CircuitBreaker;

	constructor(private readonly config: ConfigService) {
		this.baseUrl = (
			this.config.get<string>('LEDGER_SERVICE_URL') ?? 'http://localhost:3001'
		).replace(/\/$/, '');
		this.serviceKey = (this.config.get<string>('LEDGER_SERVICE_API_KEY') ?? '').trim();
		const threshold = Number(this.config.get('LEDGER_CIRCUIT_FAILURES') ?? 5);
		const cooldown = Number(this.config.get('LEDGER_CIRCUIT_COOLDOWN_MS') ?? 30_000);
		this.breaker = new CircuitBreaker(threshold, cooldown, 'ledger');
	}

	async getWallet(walletId: string): Promise<LedgerWalletView> {
		return this.request<LedgerWalletView>('GET', `/internal/wallets/${walletId}`);
	}

	async getHold(holdId: string): Promise<LedgerHold> {
		return this.request<LedgerHold>('GET', `/holds/${holdId}`);
	}

	async resolveDestination(
		identifier: string,
		preferCurrency?: string,
	): Promise<{
		walletId: string | null;
		ownerId: string | null;
		currency: string;
		createdHint: boolean;
	}> {
		const q = new URLSearchParams({ identifier });
		if (preferCurrency) q.set('preferCurrency', preferCurrency);
		return this.request('GET', `/wallets/resolve?${q.toString()}`);
	}

	async placeHold(input: {
		walletId: string;
		amount: number;
		currency: string;
		sagaId: string;
		commandId: string;
	}): Promise<LedgerHold> {
		return this.request<LedgerHold>('POST', `/wallets/${input.walletId}/holds`, {
			amount: input.amount,
			currency: input.currency,
			sagaId: input.sagaId,
			commandId: input.commandId,
		});
	}

	async captureHold(holdId: string, commandId: string, sagaId: string): Promise<LedgerHold> {
		return this.request<LedgerHold>('POST', `/holds/${holdId}/capture`, {
			commandId,
			sagaId,
		});
	}

	async releaseHold(holdId: string, commandId: string, sagaId: string): Promise<LedgerHold> {
		return this.request<LedgerHold>('POST', `/holds/${holdId}/release`, {
			commandId,
			sagaId,
		});
	}

	async credit(input: {
		toIdentifier?: string;
		toWalletId?: string;
		amount: number;
		currency: string;
		sagaId: string;
		commandId: string;
	}): Promise<LedgerCreditResult> {
		return this.request<LedgerCreditResult>('POST', '/wallets/credit', {
			toIdentifier: input.toIdentifier,
			toWalletId: input.toWalletId,
			amount: input.amount,
			currency: input.currency,
			sagaId: input.sagaId,
			commandId: input.commandId,
		});
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		this.logger.debug(`${method} ${url}`);

		if (!this.serviceKey) {
			throw new LedgerHttpError('LEDGER_SERVICE_API_KEY is not configured', 0, null);
		}

		return this.breaker.exec(async () => {
			let response: Response;
			try {
				response = await fetch(url, {
					method,
					headers: {
						'content-type': 'application/json',
						accept: 'application/json',
						'x-service-key': this.serviceKey,
						...(getTraceparent() ? { traceparent: getTraceparent()! } : {}),
					},
					body: body === undefined ? undefined : JSON.stringify(body),
				});
			} catch (err) {
				throw new LedgerHttpError(`Ledger unreachable: ${(err as Error).message}`, 0, null);
			}

			const text = await response.text();
			let parsed: unknown = null;
			if (text) {
				try {
					parsed = JSON.parse(text);
				} catch {
					parsed = text;
				}
			}

			if (!response.ok) {
				const msg =
					typeof parsed === 'object' &&
					parsed &&
					'message' in parsed &&
					(parsed as { message: unknown }).message
						? String((parsed as { message: unknown }).message)
						: `Ledger ${response.status}`;
				const httpErr = new LedgerHttpError(msg, response.status, parsed);
				if (response.status >= 400 && response.status < 500) {
					// Soft-fail: do not trip circuit on business errors.
					throw Object.assign(httpErr, { __noTrip: true });
				}
				throw httpErr;
			}

			return parsed as T;
		});
	}
}
