import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

describe('QueueService', () => {
	let service: QueueService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				QueueService,
				{
					provide: ConfigService,
					useValue: { get: () => undefined },
				},
			],
		}).compile();

		service = module.get(QueueService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('is disabled without REDIS_URL', () => {
		expect(service.enabled).toBe(false);
	});
});
