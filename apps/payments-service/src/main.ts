import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const logger = new Logger('PaymentsService');

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
				'payments_service_up 1',
			].join('\n'),
		);
	});

	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
	app.enableCors();

	const config = new DocumentBuilder()
		.setTitle('Payments Service API')
		.setDescription('P2P payments and saga orchestration API')
		.setVersion('1.0')
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document);

	const port = process.env.PORT ?? 3002;
	await app.listen(port);
	logger.log(`payments-service listening on ${port}`);
	logger.log(`Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
