import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type JournalSide = 'debit' | 'credit';

@Entity('journal_entries')
export class JournalEntry {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Index()
	@Column('uuid')
	transactionId: string;

	@Column()
	accountId: string;

	@Column({ type: 'varchar' })
	side: JournalSide;

	@Column('numeric', { precision: 18, scale: 2 })
	amount: string;

	@Column({ length: 3 })
	currency: string;

	@CreateDateColumn()
	createdAt: Date;

	@Column({ type: 'varchar', nullable: true })
	correlationId: string | null;
}
