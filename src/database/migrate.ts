import 'reflect-metadata';
import { createDataSource } from './data-source';

async function main(): Promise<void> {
  const revert = process.argv.includes('--revert');
  const dataSource = createDataSource({ migrationsRun: false });
  await dataSource.initialize();

  try {
    if (revert) {
      await dataSource.undoLastMigration({ transaction: 'each' });
      console.log('[kebab-guide] Last migration reverted.');
    } else {
      const executed = await dataSource.runMigrations({ transaction: 'each' });
      if (executed.length === 0) {
        console.log('[kebab-guide] Database is up to date (no pending migrations).');
      } else {
        console.log(`[kebab-guide] Applied ${executed.length} migration(s):`);
        for (const migration of executed) console.log(`  - ${migration.name}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[kebab-guide] Migration failed:', error);
  process.exit(1);
});
