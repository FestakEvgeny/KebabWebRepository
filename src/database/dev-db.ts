/**
 * Dev-only PostgreSQL provisioning for machines without Docker or a local
 * PostgreSQL install. Runs real PostgreSQL binaries (via the ESM-only
 * `embedded-postgres` package) from ./data/pg.
 *
 *   tsx src/database/dev-db.ts start | stop | clean
 */
import fs from 'node:fs';
import path from 'node:path';
import type EmbeddedPostgres from 'embedded-postgres';

type EmbeddedPostgresCtor = typeof EmbeddedPostgres;

const DATA_DIR = path.resolve(process.cwd(), 'data', 'pg');
const DB_USER = 'kebab';
const DB_PASSWORD = 'kebab';
const DB_NAME = 'kebab_guide';
const DB_PORT = 5432;

/** The package is ESM-only; a dynamic import keeps the CommonJS build valid. */
async function loadEmbeddedPostgres(): Promise<EmbeddedPostgresCtor> {
  const moduleId = 'embedded-postgres';
  const module = (await import(moduleId)) as { default: EmbeddedPostgresCtor };
  return module.default;
}

function createInstance(Ctor: EmbeddedPostgresCtor): EmbeddedPostgres {
  return new Ctor({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    persistent: true,
  });
}

async function start(Ctor: EmbeddedPostgresCtor): Promise<void> {
  const pg = createInstance(Ctor);
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

async function stop(Ctor: EmbeddedPostgresCtor): Promise<void> {
  await createInstance(Ctor).stop();
  console.log('[kebab-guide] Embedded PostgreSQL stopped.');
}

async function clean(Ctor: EmbeddedPostgresCtor): Promise<void> {
  try {
    await stop(Ctor);
  } catch {
    // server may not be running; that is fine
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`[kebab-guide] Removed ${DATA_DIR}`);
}

const command = process.argv[2] ?? 'start';

(async () => {
  const Ctor = await loadEmbeddedPostgres();
  switch (command) {
    case 'start':
      await start(Ctor);
      break;
    case 'stop':
      await stop(Ctor);
      break;
    case 'clean':
      await clean(Ctor);
      break;
    default:
      console.error(`Unknown command "${command}". Use start | stop | clean.`);
      process.exitCode = 1;
  }
})().catch((error: unknown) => {
  console.error('[kebab-guide] dev-db failed:', error);
  process.exit(1);
});
