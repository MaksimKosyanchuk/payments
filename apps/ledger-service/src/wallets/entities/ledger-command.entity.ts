import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('ledger_commands')
export class LedgerCommand {
	@PrimaryColumn({ type: 'varchar', length: 128 })
	commandId: string;

	@Column()
	type: string;

	@Column({ type: 'jsonb' })
	response: Record<string, unknown>;

	@CreateDateColumn()
	createdAt: Date;
}
