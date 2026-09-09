import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Header payments → ledger must send (see LedgerClient). */
export const SERVICE_KEY_HEADER = 'x-service-key';

/**
 * Guards internal/saga routes: shared secret between payments and ledger.
 * Fail-closed if LEDGER_SERVICE_API_KEY is not configured.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
	constructor(private readonly config: ConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const expected = this.config.get<string>('LEDGER_SERVICE_API_KEY')?.trim();
		if (!expected) {
			throw new UnauthorizedException('Service auth is not configured');
		}

		const req = context.switchToHttp().getRequest<{
			headers: Record<string, string | string[] | undefined>;
		}>();
		const raw = req.headers[SERVICE_KEY_HEADER] ?? req.headers['authorization'];
		const provided = this.extractKey(raw);
		if (!provided || !safeEqual(provided, expected)) {
			throw new UnauthorizedException('Invalid service credentials');
		}
		return true;
	}

	private extractKey(raw: string | string[] | undefined): string | null {
		const value = Array.isArray(raw) ? raw[0] : raw;
		if (!value?.trim()) {
			return null;
		}
		const trimmed = value.trim();
		if (trimmed.toLowerCase().startsWith('service ')) {
			return trimmed.slice('service '.length).trim();
		}
		if (trimmed.toLowerCase().startsWith('bearer ')) {
			// Allow Bearer <service-key> as alternate form
			return trimmed.slice('bearer '.length).trim();
		}
		return trimmed;
	}
}

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}
