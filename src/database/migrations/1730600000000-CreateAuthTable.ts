import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTable1730600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() is built into PostgreSQL 13+; pgcrypto covers older installs.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(() => undefined);

    await queryRunner.query(`
      CREATE TABLE "auth_table" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "access_token" varchar(128) NOT NULL,
        "refresh_token" varchar(128) NOT NULL,
        "access_token_expires_at" timestamptz NOT NULL,
        "refresh_token_expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_auth_table_access_token" UNIQUE ("access_token"),
        CONSTRAINT "uq_auth_table_refresh_token" UNIQUE ("refresh_token")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_table"`);
  }
}
