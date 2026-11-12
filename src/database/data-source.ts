import path from 'node:path';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { CreateDataSourceOptions } from './create-data-source-options';
import { AdminUser } from './entities/admin-user.entity';
import { AuthToken } from './entities/auth-token.entity';
import { Rating } from './entities/rating.entity';
import { Shop } from './entities/shop.entity';
import { User } from './entities/user.entity';
import { SnakeNamingStrategy } from './naming-strategy';

export const entities = [Shop, Rating, AdminUser, AuthToken, User];

export function createDataSource(options: CreateDataSourceOptions = {}): DataSource {
  return new DataSource({
    type: 'postgres',
    url: env.DATABASE_URL,
    entities,
    namingStrategy: new SnakeNamingStrategy(),
    migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
    synchronize: false,
    logging: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    migrationsRun: options.migrationsRun ?? env.RUN_MIGRATIONS_ON_START,
    migrationsTransactionMode: 'each',
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
}
