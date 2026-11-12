import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAuth1730700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_table" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_table_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "auth_table"
        ADD COLUMN "is_authorized" boolean NOT NULL DEFAULT false,
        ADD COLUMN "user_id" uuid REFERENCES "user_table" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`CREATE INDEX "idx_auth_table_user_id" ON "auth_table" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_auth_table_user_id"`);
    await queryRunner.query(`
      ALTER TABLE "auth_table"
        DROP COLUMN IF EXISTS "user_id",
        DROP COLUMN IF EXISTS "is_authorized"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_table"`);
  }
}
