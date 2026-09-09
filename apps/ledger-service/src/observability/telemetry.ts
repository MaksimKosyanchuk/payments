import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdk: NodeSDK | null = null;

export async function startTelemetry(serviceName: string): Promise<void> {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		return;
	}
	sdk = new NodeSDK({
		serviceName,
		traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
	});
	await sdk.start();
}
