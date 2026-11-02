import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialTables1730500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() is built into PostgreSQL 13+; pgcrypto covers older installs.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(() => undefined);

    await queryRunner.query(`
      CREATE TABLE "shop_table" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "latitude" double precision NOT NULL
          CONSTRAINT "shop_table_latitude_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
        "longitude" double precision NOT NULL
          CONSTRAINT "shop_table_longitude_check" CHECK ("longitude" >= -180 AND "longitude" <= 180),
        "rating" numeric(3, 2),
        "count_of_rates" integer,
        "photo" bytea,
        "photo_mime_type" varchar(100),
        "is_validated" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rating_table" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL REFERENCES "shop_table" ("id") ON DELETE CASCADE,
        "food_quality_rating" smallint NOT NULL
          CONSTRAINT "rating_table_food_quality_check" CHECK ("food_quality_rating" BETWEEN 1 AND 5),
        "price_fair_rating" smallint NOT NULL
          CONSTRAINT "rating_table_price_fair_check" CHECK ("price_fair_rating" BETWEEN 1 AND 5),
        "interior_rating" smallint NOT NULL
          CONSTRAINT "rating_table_interior_check" CHECK ("interior_rating" BETWEEN 1 AND 5),
        "notes" text,
        "photo" bytea,
        "photo_mime_type" varchar(100),
        "is_validated" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_user" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL UNIQUE,
        "password_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Session store used by connect-pg-simple.
    await queryRunner.query(`
      CREATE TABLE "admin_session" (
        "sid" varchar(36) NOT NULL PRIMARY KEY,
        "sess" jsonb NOT NULL,
        "expire" timestamp(6) NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_shop_table_is_validated" ON "shop_table" ("is_validated")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_rating_table_shop_id" ON "rating_table" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_rating_table_is_validated" ON "rating_table" ("is_validated")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_session_expire" ON "admin_session" ("expire")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_admin_session_expire"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rating_table_is_validated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rating_table_shop_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_shop_table_is_validated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rating_table"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_table"`);
  }
}
