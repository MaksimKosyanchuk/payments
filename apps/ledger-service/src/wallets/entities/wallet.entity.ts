import {
	Column,
	CreateDateColumn,
	Entity,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/** Account identity only — money = fold of ledger events from zero. */
@Entity('wallets')
export class Wallet {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => User, (user) => user.wallets)
	owner: User;

	@Column()
	ownerId: string;

	@Column({ default: 'USD', length: 3 })
	currency: string;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;
}

/** API / UI view — balance = available (compat with frontend). */
export interface WalletView {
	id: string;
	ownerId: string;
	currency: string;
	available: string;
	held: string;
	balance: string;
	asOfVersion: number;
	createdAt?: Date;
	updatedAt?: Date;
}
