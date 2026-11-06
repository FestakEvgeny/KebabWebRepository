import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row per issued token pair. Clients obtain a pair via
 * GET /api/v1/oauth/token and rotate the access token via
 * POST /api/v1/oauth/token. Both token columns are globally unique;
 * an expired refresh token causes the whole row to be deleted.
 */
@Entity({ name: 'auth_table' })
export class AuthToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128, name: 'access_token', unique: true })
  accessToken!: string;

  @Column({ type: 'varchar', length: 128, name: 'refresh_token', unique: true })
  refreshToken!: string;

  @Column({ type: 'timestamptz', name: 'access_token_expires_at' })
  accessTokenExpiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'refresh_token_expires_at' })
  refreshTokenExpiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
