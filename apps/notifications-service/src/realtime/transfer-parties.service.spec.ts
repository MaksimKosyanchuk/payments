import { TransferPartiesService } from './transfer-parties.service';

describe('TransferPartiesService.isParty', () => {
	const svc = Object.create(TransferPartiesService.prototype) as TransferPartiesService;

	it('allows initiator', () => {
		expect(
			svc.isParty('u1', { initiatorId: 'u1', recipientOwnerId: 'u2' }),
		).toBe(true);
	});

	it('allows recipient', () => {
		expect(
			svc.isParty('u2', { initiatorId: 'u1', recipientOwnerId: 'u2' }),
		).toBe(true);
	});

	it('denies stranger', () => {
		expect(
			svc.isParty('u3', { initiatorId: 'u1', recipientOwnerId: 'u2' }),
		).toBe(false);
	});

	it('denies when recipient not set yet and user is not initiator', () => {
		expect(
			svc.isParty('u2', { initiatorId: 'u1', recipientOwnerId: null }),
		).toBe(false);
	});
});
