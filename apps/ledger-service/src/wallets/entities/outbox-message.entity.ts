import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outbox_messages')
export class OutboxMessage {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Index({ unique: true })
	@Column('uuid')
	eventId: string;

	@Column()
	type: string;

	@Column({ type: 'jsonb' })
	payload: Record<string, unknown>;

	@Column({ type: 'varchar', nullable: true })
	correlationId: string | null;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@Index()
	@Column({ type: 'timestamptz', nullable: true })
	publishedAt: Date | null;
}
