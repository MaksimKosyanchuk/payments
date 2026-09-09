import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntry } from '../wallets/entities/journal-entry.entity';
import { LedgerEvent } from '../wallets/entities/ledger-event.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { walletStreamId } from '../wallets/ledger.events';
import { rebuildProjectionFromEvents } from '../wallets/ledger.projection';
import { WalletsService } from '../wallets/wallets.service';

export interface WalletReconcileResult {
	walletId: string;
	ok: boolean;
	/** Balance is always derived from events (no separate projection table). */
	fromEvents: { available: string; held: string; asOfVersion: number; eventCount: number };
}

export interface GlobalReconcileResult {
	ok: boolean;
	journal: {
		debitTotal: string;
		creditTotal: string;
		balanced: boolean;
		entryCount: number;
	};
	walletsChecked: number;
	wallets: WalletReconcileResult[];
}

@Injectable()
export class ReconciliationService {
	constructor(
		@InjectRepository(JournalEntry)
		private readonly journal: Repository<JournalEntry>,
		@InjectRepository(LedgerEvent)
		private readonly events: Repository<LedgerEvent>,
		@InjectRepository(Wallet)
		private readonly wallets: Repository<Wallet>,
		private readonly walletsService: WalletsService,
	) {}

	async reconcileWallet(walletId: string): Promise<WalletReconcileResult> {
		const events = await this.events.find({
			where: { streamId: walletStreamId(walletId) },
			order: { version: 'ASC' },
		});
		const rebuilt = rebuildProjectionFromEvents(events);
		const viaService = await this.walletsService.computeBalance(walletId);
		const available = rebuilt.available.toFixed(2);
		const held = rebuilt.held.toFixed(2);
		const ok = viaService.available === available && viaService.held === held;

		return {
			walletId,
			ok,
			fromEvents: {
				available,
				held,
				asOfVersion: viaService.asOfVersion,
				eventCount: events.length,
			},
		};
	}

	async reconcileAll(): Promise<GlobalReconcileResult> {
		const raw = await this.journal
			.createQueryBuilder('j')
			.select(`COALESCE(SUM(CASE WHEN j.side = 'debit' THEN j.amount ELSE 0 END), 0)`, 'debits')
			.addSelect(
				`COALESCE(SUM(CASE WHEN j.side = 'credit' THEN j.amount ELSE 0 END), 0)`,
				'credits',
			)
			.addSelect('COUNT(*)', 'cnt')
			.getRawOne<{ debits: string; credits: string; cnt: string }>();

		const debitTotal = Number(raw?.debits ?? 0).toFixed(2);
		const creditTotal = Number(raw?.credits ?? 0).toFixed(2);
		const balanced = debitTotal === creditTotal;

		const wallets = await this.wallets.find({ take: 500 });
		const results: WalletReconcileResult[] = [];
		for (const w of wallets) {
			results.push(await this.reconcileWallet(w.id));
		}

		return {
			ok: balanced && results.every((r) => r.ok),
			journal: {
				debitTotal,
				creditTotal,
				balanced,
				entryCount: Number(raw?.cnt ?? 0),
			},
			walletsChecked: wallets.length,
			wallets: results,
		};
	}
}
