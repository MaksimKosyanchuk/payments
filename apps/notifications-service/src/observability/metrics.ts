import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class MetricsService {
	readonly registry = new Registry();
	readonly requests = new Counter({
		name: 'notifications_http_requests_total',
		help: 'Total HTTP requests handled by notifications-service',
		labelNames: ['method', 'route', 'status'] as const,
		registers: [this.registry],
	});
	readonly duration = new Histogram({
		name: 'notifications_http_request_duration_seconds',
		help: 'HTTP request duration in seconds',
		labelNames: ['method', 'route'] as const,
		registers: [this.registry],
	});
	readonly events = new Counter({
		name: 'notifications_events_total',
		help: 'Events consumed by notifications-service',
		labelNames: ['type', 'status'] as const,
		registers: [this.registry],
	});

	constructor() {
		collectDefaultMetrics({ register: this.registry, prefix: 'notifications_' });
	}

	observeRequest(method: string, route: string, status: number, durationMs: number): void {
		this.requests.inc({ method, route, status: String(status) });
		this.duration.observe({ method, route }, durationMs / 1000);
	}

	async render(): Promise<string> {
		return this.registry.metrics();
	}
}
