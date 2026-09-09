import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WalletsService } from '../src/wallets/wallets.service';
import { Wallet } from '../src/wallets/entities/wallet.entity';
import { Hold } from '../src/wallets/entities/hold.entity';
import { LedgerCommand } from '../src/wallets/entities/ledger-command.entity';
import { LedgerEvent } from '../src/wallets/entities/ledger-event.entity';
import { JournalEntry } from '../src/wallets/entities/journal-entry.entity';
import { User } from '../src/auth/entities/user.entity';
import { LEDGER_EVENT } from '../src/wallets/ledger.events';

describe('WalletsService (events-only balance)', () => {
	let service: WalletsService;
	let em: {
		findOne: jest.Mock;
		find: jest.Mock;
		save: jest.Mock;
		create: jest.Mock;
	};
	let eventRows: Array<Record<string, unknown>>;

	beforeEach(async () => {
		eventRows = [
			{
				id: 'e0',
				streamId: 'wallet:wallet-1',
				version: 1,
				type: LEDGER_EVENT.WalletOpened,
				payload: { currency: 'USD' },
			},
			{
				id: 'e1',
				streamId: 'wallet:wallet-1',
				version: 2,
				type: LEDGER_EVENT.MoneyDeposited,
				payload: { amount: 100 },
			},
		];

		em = {
			findOne: jest.fn(),
			find: jest.fn(async (cls: unknown) => {
				if (cls === LedgerEvent) return [...eventRows];
				return [];
			}),
			save: jest.fn(async (entity: Record<string, unknown>) => {
				if (
					entity &&
					entity.type === LEDGER_EVENT.MoneyDeposited &&
					typeof entity.version === 'number'
				) {
					const saved = { ...entity, id: 'evt-new', version: entity.version };
					eventRows.push(saved);
					return saved;
				}
				if (entity && typeof entity === 'object' && !entity.id) {
					return { ...entity, id: 'generated-id' };
				}
				return entity;
			}),
			create: jest.fn((_cls, data) => ({ ...(data ?? _cls) })),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				WalletsService,
				{
					provide: DataSource,
					useValue: {
						transaction: jest.fn(async (fn: (m: typeof em) => unknown) => fn(em)),
					},
				},
				{ provide: getRepositoryToken(Wallet), useValue: { findOne: jest.fn() } },
				{
					provide: getRepositoryToken(LedgerEvent),
					useValue: {
						find: jest.fn(async () => [...eventRows]),
					},
				},
				{ provide: getRepositoryToken(JournalEntry), useValue: {} },
				{ provide: getRepositoryToken(Hold), useValue: { findOne: jest.fn() } },
				{ provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
				{
					provide: getRepositoryToken(LedgerCommand),
					useValue: { findOne: jest.fn().mockResolvedValue(null) },
				},
			],
		}).compile();

		service = moduleRef.get(WalletsService);
	});

	it('deposit appends MoneyDeposited and balance is fold of events', async () => {
		const wallet = { id: 'wallet-1', ownerId: 'u1', currency: 'USD' };

		em.findOne.mockImplementation(async (cls: unknown, opts?: { order?: unknown }) => {
			if (cls === Wallet) return wallet;
			if (cls === LedgerEvent && opts?.order) {
				return eventRows[eventRows.length - 1];
			}
			return null;
		});

		const result = await service.deposit('wallet-1', 50);
		expect(result.balance).toBe('150.00');
		expect(result.available).toBe('150.00');
		expect(result.held).toBe('0.00');
		expect(result.asOfVersion).toBe(3);
		expect(em.save).toHaveBeenCalled();
	});

	it('withdraw rejects when available is insufficient', async () => {
		const { BadRequestException } = await import('@nestjs/common');
		em.findOne.mockImplementation(async (cls: unknown) => {
			if (cls === Wallet) return { id: 'wallet-1', currency: 'USD' };
			return null;
		});
		em.find.mockResolvedValue([
			{
				version: 1,
				type: LEDGER_EVENT.WalletOpened,
				payload: {},
			},
			{
				version: 2,
				type: LEDGER_EVENT.MoneyDeposited,
				payload: { amount: 10 },
			},
		]);

		await expect(service.withdraw('wallet-1', 500)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});
});
