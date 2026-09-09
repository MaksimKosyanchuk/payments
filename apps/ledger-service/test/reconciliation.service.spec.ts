import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { JournalEntry } from '../src/wallets/entities/journal-entry.entity';
import { LedgerEvent } from '../src/wallets/entities/ledger-event.entity';
import { Wallet } from '../src/wallets/entities/wallet.entity';
import { WalletsService } from '../src/wallets/wallets.service';

describe('ReconciliationService', () => {
	it('reports a zero journal difference after balanced operations', async () => {
		const aggregate = jest.fn().mockResolvedValue({
			debits: '150.00',
			credits: '150.00',
			cnt: '6',
		});
		const walletsService = {
			computeBalance: jest.fn().mockResolvedValue({
				available: '0.00',
				held: '0.00',
				asOfVersion: 0,
			}),
		};
		const moduleRef = await Test.createTestingModule({
			providers: [
				ReconciliationService,
				{
					provide: getRepositoryToken(JournalEntry),
					useValue: {
						createQueryBuilder: () => ({
							select: () => ({
								addSelect: () => ({
									addSelect: () => ({ getRawOne: aggregate }),
								}),
							}),
						}),
					},
				},
				{
					provide: getRepositoryToken(LedgerEvent),
					useValue: { find: jest.fn().mockResolvedValue([]) },
				},
				{
					provide: getRepositoryToken(Wallet),
					useValue: { find: jest.fn().mockResolvedValue([{ id: 'wallet-1' }]) },
				},
				{ provide: WalletsService, useValue: walletsService },
			],
		}).compile();

		const result = await moduleRef.get(ReconciliationService).reconcileAll();

		expect(result.ok).toBe(true);
		expect(result.journal.debitTotal).toBe('150.00');
		expect(result.journal.creditTotal).toBe('150.00');
		expect(result.journal.balanced).toBe(true);
		expect(result.walletsChecked).toBe(1);
	});
});
