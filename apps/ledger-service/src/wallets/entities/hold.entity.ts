import {
	Column,
	CreateDateColumn,
	Entity,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export type HoldStatus = 'open' | 'captured' | 'released' | 'expired';

@Entity('holds')
export class Hold {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column()
	walletId: string;

	@ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
	wallet: Wallet;

	@Column('numeric', { precision: 18, scale: 2 })
	amount: string;

	@Column({ length: 3 })
	currency: string;

	@Column({ type: 'varchar', default: 'open' })
	status: HoldStatus;

	@Column({ type: 'varchar', nullable: true })
	sagaId: string | null;

	@Column({ type: 'varchar', nullable: true, unique: true })
	commandId: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt: Date | null;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;
}
