import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SagaService } from './saga.service';
import { TransferStore } from '../transfers/transfer.store';
import { MemoryTransferStore } from '../transfers/transfer.memory-store';
import { LedgerClient } from '../ledger/ledger.client';
import { FxService } from '../fx/fx.service';
import { OutboxService } from '../outbox/outbox.service';
import { QueueService } from '../queue/queue.service';
import { TransferRecord, TransferSagaContext } from '../transfers/transfer.types';
import { TRANSFER_OUTBOX_EVENT } from '../transfers/transfer.events';
import { MetricsService } from '../observability/metrics';

describe('SagaService (TZ one-hold + FX)', () => {
	let service: SagaService;
	let store: TransferStore;
	let fx: FxService;
	let ledger: {
		getWallet: jest.Mock;
		getHold: jest.Mock;
		resolveDestination: jest.Mock;
		placeHold: jest.Mock;
		captureHold: jest.Mock;
		releaseHold: jest.Mock;
		credit: jest.Mock;
	};

	let outbox: { enqueueTransferEvent: jest.Mock };

	const baseCtx: TransferSagaContext = {
		transferId: 'tx-1',
		idempotencyKey: 'idem-key-abcdefgh',
		fromWalletId: 'wallet-from',
		toWalletIdentifier: 'user@example.com',
		amount: 50,
		currency: 'USD',
		toCurrency: 'USD',
		amountTo: 50,
		fxRate: 1,
	};

	async function seedPending(overrides: Partial<TransferRecord> = {}): Promise<TransferRecord> {
		const now = new Date();
		return store.create({
			data: {
				id: baseCtx.transferId,
				idempotencyKey: baseCtx.idempotencyKey,
				fromWalletId: baseCtx.fromWalletId,
				toWalletId: null,
				toIdentifier: baseCtx.toWalletIdentifier,
				amount: baseCtx.amount,
				currency: baseCtx.currency,
				toCurrency: baseCtx.toCurrency,
				amountTo: baseCtx.amountTo,
				fxRate: baseCtx.fxRate,
				status: 'Pending',
				currentStep: null,
				holdId: null,
				failureReason: null,
				compensationAction: null,
				attempts: 0,
				nextRetryAt: null,
				initiatorId: null,
				createdAt: now,
				updatedAt: now,
				...overrides,
			},
		});
	}

	beforeEach(async () => {
		ledger = {
			getWallet: jest.fn().mockResolvedValue({
				id: baseCtx.fromWalletId,
				available: '100.00',
				held: '0.00',
				currency: 'USD',
			}),
			getHold: jest.fn(),
			resolveDestination: jest.fn().mockResolvedValue({
				walletId: 'wallet-to',
				ownerId: 'owner-to',
				currency: 'USD',
				createdHint: false,
			}),
			placeHold: jest.fn().mockResolvedValue({ id: 'hold-1', status: 'open' }),
			captureHold: jest.fn().mockResolvedValue({ id: 'hold-1', status: 'captured' }),
			releaseHold: jest.fn().mockResolvedValue({ id: 'hold-1', status: 'released' }),
			credit: jest.fn().mockResolvedValue({ walletId: 'wallet-to' }),
		};

		outbox = {
			enqueueTransferEvent: jest.fn().mockResolvedValue(undefined),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SagaService,
				MetricsService,
				FxService,
				{ provide: ConfigService, useValue: { get: () => '600000' } },
				{ provide: TransferStore, useClass: MemoryTransferStore },
				{ provide: LedgerClient, useValue: ledger },
				{ provide: OutboxService, useValue: outbox },
				{
					provide: QueueService,
					useValue: { setTransferParties: jest.fn().mockResolvedValue(undefined) },
				},
			],
		}).compile();

		service = module.get(SagaService);
		store = module.get(TransferStore);
		fx = module.get(FxService);
		fx.setRates({ USD: 1, EUR: 0.5, UAH: 40 }, new Date());
		await seedPending();
	});

	it('happy path same currency: hold amount, credit same amount', async () => {
		await service.executeTransfer({ ...baseCtx });

		expect(ledger.placeHold).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 50, currency: 'USD' }),
		);
		expect(ledger.credit).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 50, currency: 'USD' }),
		);
		const row = await store.findUnique({ where: { id: baseCtx.transferId } });
		expect(row?.status).toBe('Completed');
		expect(row?.fxRate).toBe(1);
		expect((store as unknown as MemoryTransferStore).steps.map((step) => step.step)).toEqual(
			expect.arrayContaining([
				'start',
				'lockFx',
				'assertSenderCanPay',
				'placeHold',
				'captureHold',
				'creditRecipient',
				'complete',
			]),
		);
		expect(outbox.enqueueTransferEvent.mock.calls.map((c) => c[0])).toEqual([
			TRANSFER_OUTBOX_EVENT.Started,
			TRANSFER_OUTBOX_EVENT.BalanceChecked,
			TRANSFER_OUTBOX_EVENT.Captured,
			TRANSFER_OUTBOX_EVENT.Credited,
			TRANSFER_OUTBOX_EVENT.Completed,
		]);
	});

	it('cross-currency: backend resolves EUR wallet, hold USD, credit EUR', async () => {
		ledger.resolveDestination.mockResolvedValue({
			walletId: 'wallet-to-eur',
			ownerId: 'owner-to',
			currency: 'EUR',
			createdHint: false,
		});

		await service.executeTransfer({ ...baseCtx });

		expect(ledger.resolveDestination).toHaveBeenCalledWith(baseCtx.toWalletIdentifier, 'USD');
		expect(ledger.placeHold).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 50, currency: 'USD' }),
		);
		expect(ledger.credit).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 25,
				currency: 'EUR',
				toWalletId: 'wallet-to-eur',
			}),
		);
		const row = await store.findUnique({ where: { id: baseCtx.transferId } });
		expect(row?.status).toBe('Completed');
		expect(row?.fxRate).toBe(0.5);
		expect(row?.amountTo).toBe(25);
		expect(row?.toCurrency).toBe('EUR');
	});

	it('stale FX fails before hold', async () => {
		const shortTtlFx = new FxService({ get: () => '1000' } as never);
		shortTtlFx.setRates({ USD: 1, EUR: 0.5, UAH: 40 }, new Date(Date.now() - 5000));

		ledger.resolveDestination.mockResolvedValue({
			walletId: 'wallet-to-eur',
			ownerId: 'owner-to',
			currency: 'EUR',
			createdHint: false,
		});

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SagaService,
				MetricsService,
				{ provide: FxService, useValue: shortTtlFx },
				{ provide: TransferStore, useClass: MemoryTransferStore },
				{ provide: LedgerClient, useValue: ledger },
				{ provide: OutboxService, useValue: outbox },
				{
					provide: QueueService,
					useValue: { setTransferParties: jest.fn().mockResolvedValue(undefined) },
				},
			],
		}).compile();
		const staleService = module.get(SagaService);
		const staleStore = module.get(TransferStore);
		await staleStore.create({
			data: {
				id: 'tx-stale',
				idempotencyKey: 'idem-stale-key-xx',
				fromWalletId: baseCtx.fromWalletId,
				toWalletId: null,
				toIdentifier: baseCtx.toWalletIdentifier,
				amount: 50,
				currency: 'USD',
				toCurrency: 'USD',
				amountTo: 50,
				fxRate: 1,
				status: 'Pending',
				currentStep: null,
				holdId: null,
				failureReason: null,
				compensationAction: null,
				attempts: 0,
				nextRetryAt: null,
				initiatorId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await staleService.executeTransfer({
			...baseCtx,
			transferId: 'tx-stale',
			idempotencyKey: 'idem-stale-key-xx',
		});

		expect(ledger.placeHold).not.toHaveBeenCalled();
		const row = await staleStore.findUnique({ where: { id: 'tx-stale' } });
		expect(row?.status).toBe('Failed');
		expect(row?.failureReason).toBe('fx_rate_stale');
		expect(outbox.enqueueTransferEvent).toHaveBeenCalledWith(
			TRANSFER_OUTBOX_EVENT.Started,
			expect.anything(),
			expect.anything(),
		);
		expect(outbox.enqueueTransferEvent).toHaveBeenCalledWith(
			TRANSFER_OUTBOX_EVENT.Failed,
			expect.anything(),
			expect.objectContaining({ failureReason: 'fx_rate_stale' }),
		);
	});

	it('placeHold failed → Failed (no compensation)', async () => {
		ledger.placeHold.mockRejectedValue(new Error('insufficient'));

		await service.executeTransfer({ ...baseCtx });

		const row = await store.findUnique({ where: { id: baseCtx.transferId } });
		expect(row?.status).toBe('Failed');
		expect(row?.failureReason).toBe('place_hold_failed');
		expect(ledger.captureHold).not.toHaveBeenCalled();
	});

	it('capture failed → releaseHold → Failed', async () => {
		ledger.captureHold.mockRejectedValue(new Error('network'));
		ledger.getHold.mockResolvedValue({ id: 'hold-1', status: 'open' });

		await service.executeTransfer({ ...baseCtx });

		expect(ledger.releaseHold).toHaveBeenCalled();
		const row = await store.findUnique({ where: { id: baseCtx.transferId } });
		expect(row?.status).toBe('Failed');
		expect(row?.failureReason).toBe('capture_failed_hold_released');
	});

	it('credit failed after capture → refundSender in from currency', async () => {
		ledger.credit
			.mockRejectedValueOnce(new Error('recipient blocked'))
			.mockResolvedValueOnce({ walletId: baseCtx.fromWalletId });

		await service.executeTransfer({ ...baseCtx });

		expect(ledger.credit).toHaveBeenLastCalledWith(
			expect.objectContaining({
				toWalletId: baseCtx.fromWalletId,
				amount: 50,
				currency: 'USD',
				commandId: `${baseCtx.idempotencyKey}:refundSender`,
			}),
		);
		const row = await store.findUnique({ where: { id: baseCtx.transferId } });
		expect(row?.status).toBe('Failed');
		expect(row?.failureReason).toBe('credit_failed_refunded');
	});

	it('does not replay saga for already completed transfer', async () => {
		await store.update({
			where: { id: baseCtx.transferId },
			data: {
				status: 'Completed',
				currentStep: 'complete',
				failureReason: null,
			},
		});

		await service.executeTransfer({ ...baseCtx });

		expect(ledger.getWallet).not.toHaveBeenCalled();
		expect(ledger.placeHold).not.toHaveBeenCalled();
		expect(ledger.credit).not.toHaveBeenCalled();
	});

	it('does not replay saga for already failed transfer', async () => {
		await store.update({
			where: { id: baseCtx.transferId },
			data: {
				status: 'Failed',
				currentStep: 'lockFx',
				failureReason: 'fx_rate_stale',
			},
		});

		await service.executeTransfer({ ...baseCtx });

		expect(ledger.getWallet).not.toHaveBeenCalled();
		expect(ledger.placeHold).not.toHaveBeenCalled();
		expect(ledger.credit).not.toHaveBeenCalled();
	});
});
