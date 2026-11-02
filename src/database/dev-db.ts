/**
 * Dev-only PostgreSQL provisioning for machines without Docker or a local
 * PostgreSQL install. Runs real PostgreSQL binaries (via the ESM-only
 * `embedded-postgres` package) from ./data/pg.
 *
 *   tsx src/database/dev-db.ts start | stop | clean
 */
import fs from 'node:fs';
import path from 'node:path';

interface EmbeddedPostgresOptions {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent?: boolean;
}

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(database: string): Promise<void>;
}

type EmbeddedPostgresConstructor = new (options: EmbeddedPostgresOptions) => EmbeddedPostgresInstance;

const DATA_DIR = path.resolve(process.cwd(), 'data', 'pg');
const DB_USER = 'kebab';
const DB_PASSWORD = 'kebab';
const DB_NAME = 'kebab_guide';
const DB_PORT = 5432;

/** The package is ESM-only; a dynamic import keeps the CommonJS build valid. */
async function loadEmbeddedPostgres(): Promise<EmbeddedPostgresConstructor> {
  const moduleId = 'embedded-postgres';
  const module = (await import(moduleId)) as { default: EmbeddedPostgresConstructor };
  return module.default;
}

async function start(EmbeddedPostgres: EmbeddedPostgresConstructor): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    persistent: true,
  });
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log(`[kebab-guide] Initialising embedded PostgreSQL in ${DATA_DIR}`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[kebab-guide] Database "${DB_NAME}" created.`);
  } catch {
    console.log(`[kebab-guide] Database "${DB_NAME}" already exists.`);
  }
  console.log(`[kebab-guide] Embedded PostgreSQL listening on localhost:${DB_PORT}`);
  console.log(
    `[kebab-guide] Connection string: postgres://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}`,
  );
}

async function stop(EmbeddedPostgres: EmbeddedPostgresConstructor): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    persistent: true,
  });
  await pg.stop();
  console.log('[kebab-guide] Embedded PostgreSQL stopped.');
}

async function clean(EmbeddedPostgres: EmbeddedPostgresConstructor): Promise<void> {
  try {
    await stop(EmbeddedPostgres);
  } catch {
    // server may not be running; that is fine
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`[kebab-guide] Removed ${DATA_DIR}`);
}

const command = process.argv[2] ?? 'start';

(async () => {
  const EmbeddedPostgres = await loadEmbeddedPostgres();
  switch (command) {
    case 'start':
      await start(EmbeddedPostgres);
      break;
    case 'stop':
      await stop(EmbeddedPostgres);
      break;
    case 'clean':
      await clean(EmbeddedPostgres);
      break;
    default:
      console.error(`Unknown command "${command}". Use start | stop | clean.`);
      process.exitCode = 1;
  }
})().catch((error: unknown) => {
  console.error('[kebab-guide] dev-db failed:', error);
  process.exit(1);
});
