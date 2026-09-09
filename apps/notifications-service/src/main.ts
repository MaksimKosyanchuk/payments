import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { MetricsService } from './observability/metrics';
import { startTelemetry } from './observability/telemetry';

async function bootstrap() {
	await startTelemetry('notifications-service');
	const app = await NestFactory.create(AppModule);
	const logger = new Logger('NotificationsService');
	const metrics = app.get(MetricsService);
	const tracer = trace.getTracer('notifications-service');

	app.use((req: Request, res: Response, next: NextFunction) => {
		const traceparent =
			(req.headers.traceparent as string | undefined) ??
			(req.headers['x-correlation-id'] as string | undefined) ??
			randomUUID();
		const traceId = traceparent;
		res.setHeader('x-correlation-id', traceId);
		res.setHeader('traceparent', traceparent);
		tracer.startActiveSpan(`${req.method} ${req.path}`, (span) => {
			const startedAt = Date.now();
			res.on('finish', () => {
				span.setAttribute('http.status_code', res.statusCode);
				span.setAttribute('traceparent', traceId);
				span.end();
				logger.log(
					JSON.stringify({
						event: 'http_request',
						traceId,
						method: req.method,
						url: req.originalUrl,
						statusCode: res.statusCode,
						durationMs: Date.now() - startedAt,
					}),
				);
				metrics.observeRequest(
					req.method,
					req.path,
					res.statusCode,
					Date.now() - startedAt,
				);
			});
			next();
		});
	});

	app.use('/metrics', async (_req: Request, res: Response) => {
		res.setHeader('Content-Type', 'text/plain; version=0.0.4');
		res.send(await metrics.render());
	});

	app.enableCors({ origin: true, credentials: true });

	const config = new DocumentBuilder()
		.setTitle('Notifications Service API')
		.setDescription('Activity feed and WebSocket notification API')
		.setVersion('1.0')
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document);

	const port = process.env.PORT ?? 3003;
	await app.listen(port);
	logger.log(`notifications-service listening on ${port}`);
	logger.log(`Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
