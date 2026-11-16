import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Rating } from './rating.entity';

@Entity({ name: 'shop_table' })
@Index('idx_shop_table_is_validated', ['isValidated'])
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  /**
   * Average of validated ratings (1.00-5.00). NUMERIC columns come back from
   * node-postgres as strings, so convert with Number() when serializing.
   */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, default: null })
  rating!: string | null;

  /** Total number of validated ratings for this shop. */
  @Column({ type: 'integer', nullable: true, name: 'count_of_rates', default: null })
  countOfRates!: number | null;

  @Column({ type: 'bytea', nullable: true })
  photo!: Buffer | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'photo_mime_type' })
  photoMimeType!: string | null;

  /** Moderation flag; shops become publicly trustworthy once an admin validates them. */
  @Column({ type: 'boolean', name: 'is_validated', default: false })
  isValidated!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Rating, (rating) => rating.shop)
  ratings!: Rating[];
}
