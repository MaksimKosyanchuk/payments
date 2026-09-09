import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';

@Entity('users')
export class User {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ unique: true })
	email: string;

	@Column()
	passwordHash: string;

	@Column({ type: 'varchar', nullable: true })
	refreshTokenHash: string | null;

	@Column({ type: 'varchar', default: 'user' })
	role: 'user' | 'admin';

	@OneToMany(() => Wallet, (wallet) => wallet.owner)
	wallets: Wallet[];
}
