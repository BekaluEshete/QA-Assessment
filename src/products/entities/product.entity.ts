import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';

enum ProductStatus {
  FOR_SALE = 'FOR_SALE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column('decimal')
  price: number;

  @Column()
  quantity: number;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.FOR_SALE,
  })
  status: ProductStatus;

  @OneToMany(() => Transaction, (t) => t.product)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
