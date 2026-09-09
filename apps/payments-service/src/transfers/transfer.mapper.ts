import { CompensationAction as PrismaCompensationAction, Transfer, TransferStatus } from '@prisma/client';
import { CompensationAction, TransferRecord } from './transfer.types';

export function toTransferRecord(row: Transfer): TransferRecord {
	return {
		id: row.id,
		idempotencyKey: row.idempotencyKey,
		fromWalletId: row.fromWalletId,
		toWalletId: row.toWalletId,
		toIdentifier: row.toIdentifier ?? '',
		amount: Number(row.amount),
		currency: row.currency,
		toCurrency: row.toCurrency,
		amountTo: Number(row.amountTo),
		fxRate: Number(row.fxRate),
		status: row.status as TransferRecord['status'],
		currentStep: row.currentStep,
		holdId: row.holdId,
		failureReason: row.failureReason,
		compensationAction: (row.compensationAction as CompensationAction | null) ?? null,
		attempts: row.attempts,
		nextRetryAt: row.nextRetryAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toPrismaStatus(status: TransferRecord['status']): TransferStatus {
	return status as TransferStatus;
}

export function toPrismaCompensation(
	action: CompensationAction | null | undefined,
): PrismaCompensationAction | null | undefined {
	if (action === undefined) return undefined;
	if (action === null) return null;
	return action as PrismaCompensationAction;
}
