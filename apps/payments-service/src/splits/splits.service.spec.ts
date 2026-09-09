import { SplitsService } from './splits.service';

describe('SplitsService idempotency', () => {
	it('returns the existing bill for a repeated creation key', async () => {
		const prisma = {
			splitBill: {
				findUnique: jest.fn().mockResolvedValue({ id: 'bill-1' }),
			},
		};
		const service = new SplitsService(
			prisma as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);
		const existingView = { id: 'bill-1', status: 'Pending' };
		jest.spyOn(service, 'getById').mockResolvedValue(existingView as never);

		const result = await service.create(
			{
				initiatorId: 'owner-1',
				initiatorEmail: 'owner@example.com',
				toWalletId: 'wallet-1',
				total: 100,
				participants: [{ email: 'payer@example.com' }],
			} as never,
			'split-key-123456',
		);

		expect(result).toEqual(existingView);
		expect(prisma.splitBill.findUnique).toHaveBeenCalledWith({
			where: { idempotencyKey: 'split-key-123456' },
		});
	});

	it('rejects split creation without an idempotency key', async () => {
		const service = new SplitsService(
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);

		await expect(
			service.create({
				initiatorId: 'owner-1',
				initiatorEmail: 'owner@example.com',
				toWalletId: 'wallet-1',
				total: 100,
				participants: [{ email: 'payer@example.com' }],
			} as never),
		).rejects.toThrow('Idempotency-Key');
	});
});
