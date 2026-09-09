import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Hold } from './entities/hold.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { LedgerCommand } from './entities/ledger-command.entity';
import { LedgerEvent } from './entities/ledger-event.entity';
import { OutboxMessage } from './entities/outbox-message.entity';
import { Wallet, WalletView } from './entities/wallet.entity';
import { LEDGER_EVENT, LedgerEventType, walletStreamId } from './ledger.events';
import {
	applyEventToProjection,
	BalanceProjection,
	rebuildProjectionFromEvents,
} from './ledger.projection';

const SYSTEM_CASH = 'system:cash';

export interface ComputedBalance {
	available: string;
	held: string;
	asOfVersion: number;
}

/**
 * Money = replay of ledger events from zero.
 * No materialized balance table — Wallet is identity only; concurrency via wallet row lock.
 */
@Injectable()
export class WalletsService {
	constructor(
		private readonly dataSource: DataSource,
		@InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
		@InjectRepository(LedgerEvent)
		private readonly events: Repository<LedgerEvent>,
		@InjectRepository(Hold) private readonly holds: Repository<Hold>,
		@InjectRepository(User) private readonly users: Repository<User>,
		@InjectRepository(LedgerCommand)
		private readonly commands: Repository<LedgerCommand>,
	) {}

	/** Empty wallet + WalletOpened event (balance = fold of events). */
	async getOrCreateForUser(userId: string, currency = 'USD'): Promise<WalletView> {
		const existing = await this.wallets.findOne({ where: { ownerId: userId, currency } });
		if (existing) {
			return this.toView(existing, await this.computeBalance(existing.id));
		}

		return this.dataSource.transaction(async (em) => {
			const wallet = await em.save(
				em.create(Wallet, { ownerId: userId, currency: currency.toUpperCase() }),
			);
			await this.appendEvent(em, {
				walletId: wallet.id,
				type: LEDGER_EVENT.WalletOpened,
				payload: { ownerId: userId, currency: wallet.currency },
				correlationId: wallet.id,
			});
			return this.toView(wallet, await this.computeBalanceTx(em, wallet.id));
		});
	}

	async listForUser(userId: string): Promise<WalletView[]> {
		const list = await this.wallets.find({ where: { ownerId: userId } });
		const views: WalletView[] = [];
		for (const w of list) {
			views.push(this.toView(w, await this.computeBalance(w.id)));
		}
		return views;
	}

	async getById(walletId: string): Promise<WalletView> {
		const wallet = await this.wallets.findOne({ where: { id: walletId } });
		if (!wallet) {
			throw new NotFoundException('Гаманець не знайдено');
		}
		return this.toView(wallet, await this.computeBalance(walletId));
	}

	async deposit(walletId: string, amount: number): Promise<WalletView> {
		this.assertPositive(amount);
		return this.dataSource.transaction(async (em) => {
			const wallet = await this.loadWallet(em, walletId, { lock: true });
			await this.appendEvent(em, {
				walletId,
				type: LEDGER_EVENT.MoneyDeposited,
				payload: { amount, currency: wallet.currency },
				correlationId: walletId,
				journal: {
					transactionId: randomUUID(),
					lines: [
						{ accountId: walletId, side: 'debit', amount },
						{ accountId: SYSTEM_CASH, side: 'credit', amount },
					],
					currency: wallet.currency,
				},
			});
			return this.toView(wallet, await this.computeBalanceTx(em, walletId));
		});
	}

	async withdraw(walletId: string, amount: number): Promise<WalletView> {
		this.assertPositive(amount);
		return this.dataSource.transaction(async (em) => {
			const wallet = await this.loadWallet(em, walletId, { lock: true });
			const bal = await this.computeBalanceTx(em, walletId);
			if (Number(bal.available) < amount) {
				throw new BadRequestException('Недостатньо коштів');
			}
			await this.appendEvent(em, {
				walletId,
				type: LEDGER_EVENT.MoneyWithdrawn,
				payload: { amount, currency: wallet.currency },
				correlationId: walletId,
				journal: {
					transactionId: randomUUID(),
					lines: [
						{ accountId: walletId, side: 'credit', amount },
						{ accountId: SYSTEM_CASH, side: 'debit', amount },
					],
					currency: wallet.currency,
				},
			});
			return this.toView(wallet, await this.computeBalanceTx(em, walletId));
		});
	}

	async placeHold(input: {
		walletId: string;
		amount: number;
		currency: string;
		sagaId?: string;
		commandId: string;
	}): Promise<Hold> {
		this.assertPositive(input.amount);
		const cached = await this.getCachedCommand<Hold>(input.commandId);
		if (cached) return cached;

		return this.dataSource.transaction(async (em) => {
			const existing = await em.findOne(Hold, { where: { commandId: input.commandId } });
			if (existing) return existing;

			const wallet = await this.loadWallet(em, input.walletId, { lock: true });
			if (wallet.currency.toUpperCase() !== input.currency.toUpperCase()) {
				throw new BadRequestException('Валюта гаманця не збігається');
			}

			const bal = await this.computeBalanceTx(em, wallet.id);
			if (Number(bal.available) < input.amount) {
				throw new BadRequestException('Недостатньо коштів для hold');
			}

			const hold = await em.save(
				em.create(Hold, {
					walletId: wallet.id,
					amount: input.amount.toFixed(2),
					currency: input.currency.toUpperCase(),
					status: 'open',
					sagaId: input.sagaId ?? null,
					commandId: input.commandId,
					expiresAt: new Date(Date.now() + 30 * 60 * 1000),
				}),
			);

			await this.appendEvent(em, {
				walletId: wallet.id,
				type: LEDGER_EVENT.HoldPlaced,
				payload: {
					amount: input.amount,
					currency: wallet.currency,
					holdId: hold.id,
					sagaId: input.sagaId ?? null,
				},
				correlationId: input.sagaId ?? input.commandId,
			});

			await this.saveCommand(
				em,
				input.commandId,
				'placeHold',
				hold as unknown as Record<string, unknown>,
			);
			return hold;
		});
	}

	async getHold(holdId: string): Promise<Hold> {
		const hold = await this.holds.findOne({ where: { id: holdId } });
		if (!hold) {
			throw new NotFoundException('Hold не знайдено');
		}
		return hold;
	}

	async captureHold(holdId: string, commandId: string): Promise<Hold> {
		const cached = await this.getCachedCommand<Hold>(commandId);
		if (cached) return cached;

		return this.dataSource.transaction(async (em) => {
			const hold = await em.findOne(Hold, {
				where: { id: holdId },
				lock: { mode: 'pessimistic_write' },
			});
			if (!hold) throw new NotFoundException('Hold не знайдено');
			if (hold.status === 'captured') {
				await this.saveCommand(
					em,
					commandId,
					'captureHold',
					hold as unknown as Record<string, unknown>,
				);
				return hold;
			}
			if (hold.status !== 'open') {
				throw new BadRequestException(`Hold у статусі ${hold.status}, capture неможливий`);
			}

			await this.loadWallet(em, hold.walletId, { lock: true });
			const amount = Number(hold.amount);
			const bal = await this.computeBalanceTx(em, hold.walletId);
			if (Number(bal.held) < amount) {
				throw new BadRequestException('Неконсистентний held баланс');
			}

			hold.status = 'captured';
			const saved = await em.save(hold);

			await this.appendEvent(em, {
				walletId: hold.walletId,
				type: LEDGER_EVENT.HoldCaptured,
				payload: {
					amount,
					currency: hold.currency,
					holdId: hold.id,
					sagaId: hold.sagaId,
				},
				correlationId: hold.sagaId ?? commandId,
				journal: {
					transactionId: randomUUID(),
					lines: [
						{ accountId: hold.walletId, side: 'credit', amount },
						{ accountId: SYSTEM_CASH, side: 'debit', amount },
					],
					currency: hold.currency,
				},
			});

			await this.saveCommand(
				em,
				commandId,
				'captureHold',
				saved as unknown as Record<string, unknown>,
			);
			return saved;
		});
	}

	async releaseHold(holdId: string, commandId: string): Promise<Hold> {
		const cached = await this.getCachedCommand<Hold>(commandId);
		if (cached) return cached;

		return this.dataSource.transaction(async (em) => {
			const hold = await em.findOne(Hold, {
				where: { id: holdId },
				lock: { mode: 'pessimistic_write' },
			});
			if (!hold) throw new NotFoundException('Hold не знайдено');
			if (hold.status === 'released') {
				await this.saveCommand(
					em,
					commandId,
					'releaseHold',
					hold as unknown as Record<string, unknown>,
				);
				return hold;
			}
			if (hold.status === 'captured') {
				throw new BadRequestException({
					message: 'Hold already captured; release is not applicable',
					code: 'HOLD_ALREADY_CAPTURED',
					holdId: hold.id,
					status: hold.status,
				});
			}
			if (hold.status !== 'open') {
				throw new BadRequestException(`Hold у статусі ${hold.status}, release неможливий`);
			}

			await this.loadWallet(em, hold.walletId, { lock: true });
			const amount = Number(hold.amount);
			const bal = await this.computeBalanceTx(em, hold.walletId);
			if (Number(bal.held) < amount) {
				throw new BadRequestException('Неконсистентний held баланс');
			}

			hold.status = 'released';
			const saved = await em.save(hold);

			await this.appendEvent(em, {
				walletId: hold.walletId,
				type: LEDGER_EVENT.HoldReleased,
				payload: {
					amount,
					currency: hold.currency,
					holdId: hold.id,
					sagaId: hold.sagaId,
				},
				correlationId: hold.sagaId ?? commandId,
			});

			await this.saveCommand(
				em,
				commandId,
				'releaseHold',
				saved as unknown as Record<string, unknown>,
			);
			return saved;
		});
	}

	async credit(input: {
		toWalletId?: string;
		toIdentifier?: string;
		amount: number;
		currency: string;
		sagaId?: string;
		commandId: string;
	}): Promise<{ walletId: string; balance: string; currency: string; commandId: string }> {
		this.assertPositive(input.amount);
		const cached = await this.getCachedCommand<{
			walletId: string;
			balance: string;
			currency: string;
			commandId: string;
		}>(input.commandId);
		if (cached) return cached;

		return this.dataSource.transaction(async (em) => {
			const currency = input.currency.toUpperCase();
			const wallet = await this.resolveRecipientWallet(
				em,
				input.toWalletId,
				input.toIdentifier,
				currency,
			);
			await this.loadWallet(em, wallet.id, { lock: true });

			await this.appendEvent(em, {
				walletId: wallet.id,
				type: LEDGER_EVENT.MoneyCredited,
				payload: {
					amount: input.amount,
					currency,
					sagaId: input.sagaId ?? null,
					toIdentifier: input.toIdentifier ?? null,
				},
				correlationId: input.sagaId ?? input.commandId,
				journal: {
					transactionId: randomUUID(),
					lines: [
						{ accountId: wallet.id, side: 'debit', amount: input.amount },
						{ accountId: SYSTEM_CASH, side: 'credit', amount: input.amount },
					],
					currency,
				},
			});

			const bal = await this.computeBalanceTx(em, wallet.id);
			const response = {
				walletId: wallet.id,
				balance: bal.available,
				currency: wallet.currency,
				commandId: input.commandId,
			};
			await this.saveCommand(em, input.commandId, 'credit', response);
			return response;
		});
	}

	async debitForCompensation(
		walletId: string,
		amount: number,
		commandId: string,
	): Promise<{ walletId: string; balance: string }> {
		this.assertPositive(amount);
		const cached = await this.getCachedCommand<{ walletId: string; balance: string }>(
			commandId,
		);
		if (cached) return cached;

		return this.dataSource.transaction(async (em) => {
			const wallet = await this.loadWallet(em, walletId, { lock: true });
			const bal = await this.computeBalanceTx(em, walletId);
			if (Number(bal.available) < amount) {
				throw new BadRequestException('Неможливо компенсувати credit: недостатньо коштів');
			}

			await this.appendEvent(em, {
				walletId,
				type: LEDGER_EVENT.MoneyDebited,
				payload: { amount, currency: wallet.currency, reason: 'compensation' },
				correlationId: commandId,
				journal: {
					transactionId: randomUUID(),
					lines: [
						{ accountId: walletId, side: 'credit', amount },
						{ accountId: SYSTEM_CASH, side: 'debit', amount },
					],
					currency: wallet.currency,
				},
			});

			const next = await this.computeBalanceTx(em, walletId);
			const response = { walletId, balance: next.available };
			await this.saveCommand(em, commandId, 'debitCompensation', response);
			return response;
		});
	}

	async listEvents(walletId: string): Promise<LedgerEvent[]> {
		await this.getById(walletId);
		return this.events.find({
			where: { streamId: walletStreamId(walletId) },
			order: { version: 'ASC' },
		});
	}

	/**
	 * Resolve where money should land (for payments FX).
	 * - wallet UUID → that wallet's currency
	 * - email → preferCurrency wallet if exists, else oldest wallet;
	 *   if user has no wallets yet → currency = preferCurrency (credit will open it)
	 */
	async resolveDestination(
		identifier: string,
		preferCurrency?: string,
	): Promise<{
		walletId: string | null;
		ownerId: string | null;
		currency: string;
		createdHint: boolean;
	}> {
		const id = identifier?.trim();
		if (!id) {
			throw new BadRequestException('identifier обовʼязковий');
		}
		const prefer = (preferCurrency ?? 'USD').toUpperCase();

		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
			const wallet = await this.wallets.findOne({ where: { id } });
			if (!wallet) throw new NotFoundException('Гаманець отримувача не знайдено');
			return {
				walletId: wallet.id,
				ownerId: wallet.ownerId,
				currency: wallet.currency.toUpperCase(),
				createdHint: false,
			};
		}

		const user = await this.users.findOne({ where: { email: id.toLowerCase() } });
		if (!user) {
			throw new NotFoundException('Отримувача не знайдено');
		}

		const preferred = await this.wallets.findOne({
			where: { ownerId: user.id, currency: prefer },
		});
		if (preferred) {
			return {
				walletId: preferred.id,
				ownerId: user.id,
				currency: preferred.currency.toUpperCase(),
				createdHint: false,
			};
		}

		const any = await this.wallets.find({
			where: { ownerId: user.id },
			order: { createdAt: 'ASC' },
			take: 1,
		});
		if (any[0]) {
			return {
				walletId: any[0].id,
				ownerId: user.id,
				currency: any[0].currency.toUpperCase(),
				createdHint: false,
			};
		}

		// No wallet yet — credit path will open one in prefer currency (same-currency, no FX).
		return {
			walletId: null,
			ownerId: user.id,
			currency: prefer,
			createdHint: true,
		};
	}

	/** Public helper for reconciliation / admin — same fold as reads. */
	async computeBalance(walletId: string): Promise<ComputedBalance> {
		const events = await this.events.find({
			where: { streamId: walletStreamId(walletId) },
			order: { version: 'ASC' },
		});
		return this.foldEvents(events);
	}

	private async computeBalanceTx(
		em: EntityManager,
		walletId: string,
	): Promise<ComputedBalance> {
		const events = await em.find(LedgerEvent, {
			where: { streamId: walletStreamId(walletId) },
			order: { version: 'ASC' },
		});
		return this.foldEvents(events);
	}

	private foldEvents(events: LedgerEvent[]): ComputedBalance {
		const rebuilt = rebuildProjectionFromEvents(events);
		this.assertNonNegative(rebuilt);
		const asOfVersion =
			events.length === 0 ? 0 : Math.max(...events.map((e) => e.version));
		return {
			available: rebuilt.available.toFixed(2),
			held: rebuilt.held.toFixed(2),
			asOfVersion,
		};
	}

	private async appendEvent(
		em: EntityManager,
		args: {
			walletId: string;
			type: LedgerEventType;
			payload: Record<string, unknown>;
			correlationId?: string | null;
			causationId?: string | null;
			journal?: {
				transactionId: string;
				currency: string;
				lines: Array<{ accountId: string; side: 'debit' | 'credit'; amount: number }>;
			};
		},
	): Promise<LedgerEvent> {
		const streamId = walletStreamId(args.walletId);
		const current = await this.computeBalanceTx(em, args.walletId);
		const nextState = applyEventToProjection(
			{ available: Number(current.available), held: Number(current.held) },
			args.type,
			args.payload,
		);
		this.assertNonNegative(nextState);

		const last = await em.findOne(LedgerEvent, {
			where: { streamId },
			order: { version: 'DESC' },
		});
		const nextVersion = (last?.version ?? 0) + 1;

		const event = await em.save(
			em.create(LedgerEvent, {
				streamId,
				version: nextVersion,
				type: args.type,
				payload: args.payload,
				correlationId: args.correlationId ?? null,
				causationId: args.causationId ?? null,
				schemaVersion: 1,
			}),
		);

		if (args.journal) {
			for (const line of args.journal.lines) {
				await em.save(
					em.create(JournalEntry, {
						transactionId: args.journal.transactionId,
						accountId: line.accountId,
						side: line.side,
						amount: line.amount.toFixed(2),
						currency: args.journal.currency,
						correlationId: args.correlationId ?? null,
					}),
				);
			}
		}

		await em.save(
			em.create(OutboxMessage, {
				eventId: event.id,
				type: args.type,
				payload: {
					...args.payload,
					walletId: args.walletId,
					streamId,
					version: nextVersion,
				},
				correlationId: args.correlationId ?? null,
				publishedAt: null,
			}),
		);

		return event;
	}

	private async resolveRecipientWallet(
		em: EntityManager,
		toWalletId: string | undefined,
		toIdentifier: string | undefined,
		currency: string,
	): Promise<Wallet> {
		if (toWalletId) {
			const wallet = await this.loadWallet(em, toWalletId);
			if (wallet.currency.toUpperCase() !== currency) {
				throw new BadRequestException('Валюта гаманця отримувача не збігається');
			}
			return wallet;
		}

		const id = toIdentifier?.trim();
		if (!id) {
			throw new BadRequestException('toWalletId або toIdentifier обовʼязкові');
		}

		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
			return this.resolveRecipientWallet(em, id, undefined, currency);
		}

		const user = await em.findOne(User, { where: { email: id.toLowerCase() } });
		if (!user) {
			throw new NotFoundException('Отримувача не знайдено');
		}

		const existing = await em.findOne(Wallet, {
			where: { ownerId: user.id, currency },
		});
		if (existing) return existing;

		const wallet = await em.save(em.create(Wallet, { ownerId: user.id, currency }));
		await this.appendEvent(em, {
			walletId: wallet.id,
			type: LEDGER_EVENT.WalletOpened,
			payload: { ownerId: user.id, currency },
			correlationId: wallet.id,
		});
		return wallet;
	}

	private async loadWallet(
		em: EntityManager,
		walletId: string,
		opts?: { lock?: boolean },
	): Promise<Wallet> {
		const wallet = await em.findOne(Wallet, {
			where: { id: walletId },
			...(opts?.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
		});
		if (!wallet) throw new NotFoundException('Гаманець не знайдено');
		return wallet;
	}

	private toView(wallet: Wallet, bal: ComputedBalance): WalletView {
		return {
			id: wallet.id,
			ownerId: wallet.ownerId,
			currency: wallet.currency,
			available: bal.available,
			held: bal.held,
			balance: bal.available,
			asOfVersion: bal.asOfVersion,
			createdAt: wallet.createdAt,
			updatedAt: wallet.updatedAt,
		};
	}

	private assertNonNegative(state: BalanceProjection): void {
		if (state.available < -0.0001 || state.held < -0.0001) {
			throw new BadRequestException('Баланс став відʼємним');
		}
	}

	private assertPositive(amount: number): void {
		if (!(amount > 0) || !Number.isFinite(amount)) {
			throw new BadRequestException('Сума має бути додатною');
		}
	}

	private async getCachedCommand<T>(commandId: string): Promise<T | null> {
		const cached = await this.commands.findOne({ where: { commandId } });
		return cached ? (cached.response as unknown as T) : null;
	}

	private async saveCommand(
		em: EntityManager,
		commandId: string,
		type: string,
		response: Record<string, unknown>,
	): Promise<void> {
		await em.save(em.create(LedgerCommand, { commandId, type, response }));
	}
}
