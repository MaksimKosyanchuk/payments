import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('ledger_events')
@Unique(['streamId', 'version'])
export class LedgerEvent {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Index()
	@Column()
	streamId: string;

	@Column({ type: 'int' })
	version: number;

	@Column()
	type: string;

	@Column({ type: 'jsonb' })
	payload: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamptz' })
	occurredAt: Date;

	@Column({ type: 'varchar', nullable: true })
	correlationId: string | null;

	@Column({ type: 'varchar', nullable: true })
	causationId: string | null;

	@Column({ type: 'int', default: 1 })
	schemaVersion: number;
}
