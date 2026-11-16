import { DynamicModule, Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Publishes the TypeORM DataSource to every Nest module. The connection
 * itself is created and initialized outside the container (server.ts owns
 * connect/retry/migrations), so it is registered by value.
 */
@Global()
@Module({})
export class DatabaseModule {
  static forRoot(dataSource: DataSource): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DataSource, useValue: dataSource }],
      exports: [DataSource],
    };
  }
}
