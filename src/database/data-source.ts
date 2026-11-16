import path from 'node:path';
import { DataSource } from 'typeorm';
import { env } from '../shared/config/env';
import { CreateDataSourceOptions } from './create-data-source-options';
import { adminEntities } from '../modules/admin';
import { oauthEntities } from '../modules/oauth';
import { ratingEntities } from '../modules/rating';
import { shopEntities } from '../modules/shop';
import { SnakeNamingStrategy } from './naming-strategy';

// Each module owns its entities; the database layer only assembles them.
export const entities = [...shopEntities, ...ratingEntities, ...oauthEntities, ...adminEntities];

export function createDataSource(options: CreateDataSourceOptions = {}): DataSource {
  return new DataSource({
    type: 'postgres',
    url: env.DATABASE_URL,
    entities,
    namingStrategy: new SnakeNamingStrategy(),
    migrations: [
      path.join(__dirname, 'migrations', '*{.ts,.js}'),
      // Module-owned migrations live next to their module: src/modules/<name>/migrations.
      path.join(__dirname, '..', 'modules', '*', 'migrations', '*{.ts,.js}'),
    ],
    synchronize: false,
    logging: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    migrationsRun: options.migrationsRun ?? env.RUN_MIGRATIONS_ON_START,
    migrationsTransactionMode: 'each',
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
}
