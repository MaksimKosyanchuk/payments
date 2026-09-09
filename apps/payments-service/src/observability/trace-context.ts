import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const storage = new AsyncLocalStorage<string>();

export function newTraceparent(): string {
	return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

export function getTraceparent(): string | undefined {
	return storage.getStore();
}

export function runWithTraceparent<T>(traceparent: string, callback: () => T): T {
	return storage.run(traceparent, callback);
}
