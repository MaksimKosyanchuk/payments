import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class MetricsService {
	readonly registry = new Registry();
	readonly requests = new Counter({
		name: 'payments_http_requests_total',
		help: 'Total HTTP requests handled by payments-service',
		labelNames: ['method', 'route', 'status'] as const,
		registers: [this.registry],
	});
	readonly duration = new Histogram({
		name: 'payments_http_request_duration_seconds',
		help: 'HTTP request duration in seconds',
		labelNames: ['method', 'route'] as const,
		registers: [this.registry],
	});
	readonly sagaSteps = new Counter({
		name: 'payments_saga_steps_total',
		help: 'Saga steps observed by payments-service',
		labelNames: ['step', 'status'] as const,
		registers: [this.registry],
	});
	readonly sagaDuration = new Histogram({
		name: 'payments_saga_duration_seconds',
		help: 'Transfer saga duration in seconds',
		labelNames: ['status'] as const,
		registers: [this.registry],
	});

	constructor() {
		collectDefaultMetrics({ register: this.registry, prefix: 'payments_' });
	}

	observeRequest(method: string, route: string, status: number, durationMs: number): void {
		this.requests.inc({ method, route, status: String(status) });
		this.duration.observe({ method, route }, durationMs / 1000);
	}

	async render(): Promise<string> {
		return this.registry.metrics();
	}
}
