import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const logger = new Logger('NotificationsService');

	app.use((req: Request, res: Response, next: NextFunction) => {
		const traceId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
		res.setHeader('x-correlation-id', traceId);
		const startedAt = Date.now();
		res.on('finish', () => {
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
		});
		next();
	});

	app.use('/metrics', (_req: Request, res: Response) => {
		res.setHeader('Content-Type', 'text/plain; version=0.0.4');
		res.send(
			[
				'http_requests_total 0',
				'http_requests_ok_total 0',
				'http_requests_error_total 0',
				'notifications_service_up 1',
			].join('\n'),
		);
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
