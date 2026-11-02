import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from './shop.entity';

@Entity({ name: 'rating_table' })
@Index('idx_rating_table_shop_id', ['shopId'])
@Index('idx_rating_table_is_validated', ['isValidated'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId!: string;

  @ManyToOne(() => Shop, (shop) => shop.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop!: Shop;

  @Column({ type: 'smallint' })
  foodQualityRating!: number;

  @Column({ type: 'smallint' })
  priceFairRating!: number;

  @Column({ type: 'smallint' })
  interiorRating!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'bytea', nullable: true })
  photo!: Buffer | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'photo_mime_type' })
  photoMimeType!: string | null;

  /** Moderation flag set by admins; only validated ratings count toward shop aggregates. */
  @Column({ type: 'boolean', name: 'is_validated', default: false })
  isValidated!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
