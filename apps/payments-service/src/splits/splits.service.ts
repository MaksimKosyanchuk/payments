import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, SplitBillStatus, SplitShareStatus } from '@prisma/client';
import { LedgerClient } from '../ledger/ledger.client';
import { FxService } from '../fx/fx.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransfersService } from '../transfers/transfers.service';
import { CreateSplitBillDto } from './dto/create-split-bill.dto';
import { PaySplitShareDto } from './dto/pay-split-share.dto';
import { SPLIT_OUTBOX_EVENT } from './split.events';

const ALLOWED = new Set(['USD', 'EUR', 'UAH']);

@Injectable()
export class SplitsService {
	private readonly logger = new Logger(SplitsService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly ledger: LedgerClient,
		private readonly transfers: TransfersService,
		private readonly outbox: OutboxService,
		private readonly fx: FxService,
	) {}

	async create(dto: CreateSplitBillDto) {
		if (Math.round(dto.total * 100) / 100 !== dto.total) {
			throw new BadRequestException('total must have at most 2 decimal places');
		}

		const toWallet = await this.ledger.getWallet(dto.toWalletId);
		if (toWallet.ownerId !== dto.initiatorId) {
			throw new ForbiddenException('Гаманець для зарахування має належати вам');
		}
		const currency = toWallet.currency.toUpperCase();
		if (!ALLOWED.has(currency)) {
			throw new BadRequestException('currency must be USD, EUR or UAH');
		}
		if (dto.currency && dto.currency.toUpperCase() !== currency) {
			throw new BadRequestException(
				`currency має збігатися з гаманцем (${currency})`,
			);
		}

		const initEmail = dto.initiatorEmail.trim().toLowerCase();
		const participants = this.normalizeParticipants(dto).filter(
			(p) => p.email !== initEmail,
		);
		if (participants.length === 0) {
			throw new BadRequestException(
				'Додайте хоча б одного учасника (не себе) — ініціатор лише отримує',
			);
		}

		const amounts = this.allocateAmounts(dto.total, participants);

		const resolved: Array<{
			email: string;
			userId: string;
			amount: number;
		}> = [];

		for (let i = 0; i < participants.length; i++) {
			const p = participants[i];
			const dest = await this.ledger.resolveDestination(p.email, currency);
			if (!dest.ownerId) {
				throw new BadRequestException(`Учасника не знайдено: ${p.email}`);
			}
			if (dest.ownerId === dto.initiatorId) {
				throw new BadRequestException(
					'Ініціатор не може бути серед платників — оберіть інших учасників',
				);
			}
			resolved.push({
				email: p.email.toLowerCase(),
				userId: dest.ownerId,
				amount: amounts[i],
			});
		}

		const uniquePayers = new Set(resolved.map((r) => r.userId));
		if (uniquePayers.size !== resolved.length) {
			throw new BadRequestException('Учасники мають бути унікальними');
		}

		const bill = await this.prisma.splitBill.create({
			data: {
				initiatorId: dto.initiatorId,
				initiatorEmail: dto.initiatorEmail.toLowerCase(),
				toWalletId: dto.toWalletId,
				total: dto.total,
				currency,
				title: dto.title?.trim() || null,
				dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
				status: 'Pending',
				shares: {
					create: resolved.map((r) => ({
						payerId: r.userId,
						payerEmail: r.email,
						amount: r.amount,
						status: 'Pending' as SplitShareStatus,
					})),
				},
			},
			include: { shares: true },
		});

		await this.reaggregateBill(bill.id);
		const fresh = await this.prisma.splitBill.findUnique({
			where: { id: bill.id },
			include: { shares: true },
		});
		if (!fresh) {
			throw new NotFoundException('Split bill не знайдено');
		}

		await this.outbox.enqueueEvent(
			SPLIT_OUTBOX_EVENT.BillCreated,
			{
				billId: fresh.id,
				title: fresh.title,
				amount: Number(fresh.total),
				total: Number(fresh.total),
				currency: fresh.currency,
				initiatorId: fresh.initiatorId,
				dueAt: fresh.dueAt?.toISOString() ?? null,
				userIds: [fresh.initiatorId, ...resolved.map((r) => r.userId)],
			},
			fresh.id,
		);

		return this.toView(fresh);
	}

	/**
	 * Initiator was omitted from participants — add Paid share for self
	 * (already covered the expense). Amount defaults to equal slice of total.
	 */
	async addSelfShare(billId: string, userId: string, amount?: number) {
		const bill = await this.prisma.splitBill.findUnique({
			where: { id: billId },
			include: { shares: true },
		});
		if (!bill) {
			throw new NotFoundException('Split bill не знайдено');
		}
		if (bill.initiatorId !== userId) {
			throw new ForbiddenException('Лише ініціатор може додати свою частку так');
		}
		if (bill.shares.some((s) => s.payerId === userId)) {
			throw new BadRequestException('Ваша частка вже є в рахунку');
		}
		if (bill.status === 'Cancelled' || bill.status === 'Settled') {
			throw new BadRequestException(`Рахунок у статусі ${bill.status}`);
		}

		const n = bill.shares.length + 1;
		const defaultAmount =
			Math.round((Number(bill.total) / n) * 100) / 100;
		const shareAmount =
			amount != null && amount > 0
				? Math.round(amount * 100) / 100
				: defaultAmount;

		await this.prisma.splitShare.create({
			data: {
				billId: bill.id,
				payerId: userId,
				payerEmail: bill.initiatorEmail,
				amount: shareAmount,
				status: 'Paid',
			},
		});

		const newTotal =
			Math.round(
				(bill.shares.reduce((a, s) => a + Number(s.amount), 0) + shareAmount) * 100,
			) / 100;
		await this.prisma.splitBill.update({
			where: { id: bill.id },
			data: { total: newTotal },
		});

		await this.reaggregateBill(bill.id);
		return this.getById(billId, userId);
	}

	async listForUser(userId: string) {
		if (!userId?.trim()) {
			throw new BadRequestException('userId is required');
		}
		const bills = await this.prisma.splitBill.findMany({
			where: {
				OR: [{ initiatorId: userId }, { shares: { some: { payerId: userId } } }],
			},
			include: { shares: true },
			orderBy: { createdAt: 'desc' },
			take: 50,
		});
		return bills.map((b) => this.toView(b));
	}

	async getById(id: string, userId: string) {
		const bill = await this.prisma.splitBill.findUnique({
			where: { id },
			include: { shares: true },
		});
		if (!bill) {
			throw new NotFoundException('Split bill не знайдено');
		}
		const allowed =
			bill.initiatorId === userId || bill.shares.some((s) => s.payerId === userId);
		if (!allowed) {
			throw new ForbiddenException('Немає доступу до цього рахунку');
		}
		return this.toView(bill);
	}

	async payShare(billId: string, shareId: string, dto: PaySplitShareDto) {
		const bill = await this.prisma.splitBill.findUnique({
			where: { id: billId },
			include: { shares: true },
		});
		if (!bill) {
			throw new NotFoundException('Split bill не знайдено');
		}
		if (bill.status === 'Cancelled' || bill.status === 'Settled') {
			throw new BadRequestException(`Рахунок у статусі ${bill.status}`);
		}

		const share = bill.shares.find((s) => s.id === shareId);
		if (!share) {
			throw new NotFoundException('Частку не знайдено');
		}
		if (share.payerId !== dto.payerId) {
			throw new ForbiddenException('Можна оплатити лише свою частку');
		}
		if (share.status === 'Paid') {
			return {
				billId,
				shareId,
				status: share.status,
				transferId: share.transferId,
				transferStatus: 'Completed',
			};
		}

		if (!bill.toWalletId) {
			throw new BadRequestException('У рахунку немає гаманця для зарахування');
		}

		let idempotencyKey = `split-share:${share.id}`;
		if (share.transferId) {
			const existing = await this.transfers.getStatus(share.transferId);
			if (existing.status === 'Completed') {
				await this.markSharePaid(share.id, bill.id);
				return {
					billId,
					shareId,
					status: 'Paid',
					transferId: share.transferId,
					transferStatus: 'Completed',
				};
			}
			if (existing.status !== 'Failed') {
				return {
					billId,
					shareId,
					status: share.status,
					transferId: share.transferId,
					transferStatus: existing.status,
				};
			}
			// Failed transfer — new attempt
			idempotencyKey = `split-share:${share.id}:retry-${Date.now()}`;
		}

		await this.prisma.splitShare.update({
			where: { id: share.id },
			data: { status: 'Confirmed' },
		});

		const creditAmount = Number(share.amount);
		const creditCurrency = bill.currency.toUpperCase();
		const fromWallet = await this.ledger.getWallet(dto.fromWalletId);
		const debitCurrency = fromWallet.currency.toUpperCase();

		let debitAmount = creditAmount;
		let fxRate = 1;
		if (debitCurrency !== creditCurrency) {
			const quote = this.fx.quote(debitCurrency, creditCurrency);
			if (quote.stale) {
				throw new BadRequestException('fx_rate_stale');
			}
			// Recipient must get creditAmount in bill currency → debit = credit / rate
			fxRate = quote.rate;
			debitAmount = Math.round((creditAmount / quote.rate) * 100) / 100;
			if (!(debitAmount > 0)) {
				throw new BadRequestException('fx_amount_too_small');
			}
		}

		if (Number(fromWallet.available) < debitAmount) {
			throw new BadRequestException(
				`insufficient_funds: потрібно ≈ ${debitAmount} ${debitCurrency} (частка ${creditAmount} ${creditCurrency}), available=${fromWallet.available}`,
			);
		}

		const transfer = await this.transfers.create(
			{
				fromWalletId: dto.fromWalletId,
				toWalletIdentifier: bill.toWalletId,
				amount: debitAmount,
				currency: debitCurrency,
				creditCurrency,
				initiatorId: dto.payerId,
				idempotencyKey,
			},
			idempotencyKey,
		);

		await this.prisma.splitShare.update({
			where: { id: share.id },
			data: { transferId: transfer.id },
		});

		return {
			billId,
			shareId,
			status: 'Confirmed',
			transferId: transfer.id,
			transferStatus: transfer.status,
			debitAmount,
			debitCurrency,
			creditAmount,
			creditCurrency,
			fxRate,
		};
	}

	/** Sync share/bill when linked transfers complete (cron). */
	async syncPaidShares(): Promise<number> {
		const open = await this.prisma.splitShare.findMany({
			where: {
				transferId: { not: null },
				status: { in: ['Pending', 'Confirmed', 'Overdue'] },
			},
			take: 50,
		});
		let n = 0;
		for (const share of open) {
			if (!share.transferId) continue;
			try {
				const t = await this.transfers.getStatus(share.transferId);
				if (t.status === 'Completed') {
					await this.markSharePaid(share.id, share.billId);
					n += 1;
				} else if (t.status === 'Failed' && share.status === 'Confirmed') {
					await this.prisma.splitShare.update({
						where: { id: share.id },
						data: { status: 'Pending' },
					});
				}
			} catch (err) {
				this.logger.warn(
					`sync share=${share.id}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
		return n;
	}

	/** Mark overdue unpaid shares past dueAt; emit reminder events. */
	async markOverdue(): Promise<number> {
		const now = new Date();
		const bills = await this.prisma.splitBill.findMany({
			where: {
				dueAt: { lt: now },
				status: { in: ['Pending', 'PartiallyPaid'] },
			},
			include: {
				shares: { where: { status: { in: ['Pending', 'Confirmed'] } } },
			},
			take: 50,
		});
		let n = 0;
		for (const bill of bills) {
			for (const share of bill.shares) {
				await this.prisma.splitShare.update({
					where: { id: share.id },
					data: { status: 'Overdue' },
				});
				await this.outbox.enqueueEvent(
					SPLIT_OUTBOX_EVENT.ShareOverdue,
					{
						billId: bill.id,
						shareId: share.id,
						title: bill.title,
						amount: Number(share.amount),
						currency: bill.currency,
						dueAt: bill.dueAt?.toISOString() ?? null,
						userId: share.payerId,
						initiatorId: bill.initiatorId,
					},
					share.id,
				);
				n += 1;
			}
		}
		return n;
	}

	private async markSharePaid(shareId: string, billId: string): Promise<void> {
		const share = await this.prisma.splitShare.update({
			where: { id: shareId },
			data: { status: 'Paid' },
		});
		await this.reaggregateBill(billId);
		await this.outbox.enqueueEvent(
			SPLIT_OUTBOX_EVENT.SharePaid,
			{
				billId,
				shareId,
				amount: Number(share.amount),
				userId: share.payerId,
				initiatorId: (
					await this.prisma.splitBill.findUnique({ where: { id: billId } })
				)?.initiatorId,
			},
			shareId,
		);
	}

	private async reaggregateBill(billId: string): Promise<void> {
		const bill = await this.prisma.splitBill.findUnique({
			where: { id: billId },
			include: { shares: true },
		});
		if (!bill || bill.status === 'Cancelled') {
			return;
		}
		const paid = bill.shares.filter((s) => s.status === 'Paid').length;
		const total = bill.shares.length;
		let status: SplitBillStatus = 'Pending';
		if (paid === 0) status = 'Pending';
		else if (paid < total) status = 'PartiallyPaid';
		else status = 'Settled';

		if (bill.status !== status) {
			await this.prisma.splitBill.update({
				where: { id: billId },
				data: { status },
			});
			if (status === 'Settled') {
				await this.outbox.enqueueEvent(
					SPLIT_OUTBOX_EVENT.BillSettled,
					{
						billId,
						initiatorId: bill.initiatorId,
						userIds: [bill.initiatorId, ...bill.shares.map((s) => s.payerId)],
					},
					billId,
				);
			}
		}
	}

	private normalizeParticipants(dto: CreateSplitBillDto) {
		return dto.participants.map((p) => ({
			email: p.email.trim().toLowerCase(),
			amount: p.amount,
		}));
	}

	/** Equal split with remainder on last share; or custom amounts that must sum to total. */
	private allocateAmounts(
		total: number,
		participants: Array<{ email: string; amount?: number }>,
	): number[] {
		const custom = participants.every((p) => p.amount != null);
		if (custom) {
			const sum = participants.reduce((a, p) => a + (p.amount as number), 0);
			if (Math.round(sum * 100) !== Math.round(total * 100)) {
				throw new BadRequestException(
					`Сума часток (${sum}) має дорівнювати total (${total})`,
				);
			}
			return participants.map((p) => p.amount as number);
		}
		if (participants.some((p) => p.amount != null)) {
			throw new BadRequestException(
				'Або всі частки кастомні, або жодна (порівну)',
			);
		}
		const n = participants.length;
		const cents = Math.round(total * 100);
		const base = Math.floor(cents / n);
		const amounts: number[] = [];
		let allocated = 0;
		for (let i = 0; i < n; i++) {
			const c = i === n - 1 ? cents - allocated : base;
			amounts.push(c / 100);
			allocated += c;
		}
		return amounts;
	}

	private toView(
		bill: Prisma.SplitBillGetPayload<{ include: { shares: true } }>,
	) {
		return {
			id: bill.id,
			initiatorId: bill.initiatorId,
			initiatorEmail: bill.initiatorEmail,
			toWalletId: bill.toWalletId,
			total: Number(bill.total),
			currency: bill.currency,
			status: bill.status,
			title: bill.title,
			dueAt: bill.dueAt?.toISOString() ?? null,
			createdAt: bill.createdAt.toISOString(),
			shares: bill.shares.map((s) => ({
				id: s.id,
				payerId: s.payerId,
				payerEmail: s.payerEmail,
				amount: Number(s.amount),
				status: s.status,
				transferId: s.transferId,
			})),
		};
	}
}
