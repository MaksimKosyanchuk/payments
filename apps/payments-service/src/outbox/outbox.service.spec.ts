import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TRANSFER_OUTBOX_EVENT } from '../transfers/transfer.events';

describe('OutboxService', () => {
	let service: OutboxService;
	let create: jest.Mock;

	beforeEach(async () => {
		create = jest.fn().mockResolvedValue({});
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				OutboxService,
				{
					provide: PrismaService,
					useValue: {
						outboxMessage: {
							findMany: jest.fn().mockResolvedValue([]),
							update: jest.fn(),
							create,
						},
					},
				},
			],
		}).compile();

		service = module.get(OutboxService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('findPending queries publishedAt null', async () => {
		const prisma = (service as unknown as { prisma: PrismaService }).prisma;
		await service.findPending(10);
		expect(prisma.outboxMessage.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { publishedAt: null },
				take: 10,
			}),
		);
	});

	it('enqueueTransferEvent writes outbox row', async () => {
		await service.enqueueTransferEvent(
			TRANSFER_OUTBOX_EVENT.Started,
			{
				transferId: 'tx-1',
				idempotencyKey: 'idem',
				fromWalletId: 'from',
				toWalletIdentifier: 'to@x.com',
				amount: 10,
				currency: 'USD',
				toCurrency: 'USD',
				amountTo: 10,
				fxRate: 1,
			},
			{ status: 'Pending', currentStep: 'start' },
		);
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					type: TRANSFER_OUTBOX_EVENT.Started,
					correlationId: 'tx-1',
					publishedAt: null,
				}),
			}),
		);
	});
});
