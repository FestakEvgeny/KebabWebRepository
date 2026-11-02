import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createApp } from './app';
import { createDataSource } from './database/data-source';
import { env } from './config/env';

async function connectWithRetry(
  create: () => DataSource,
  attempts = 10,
  delayMs = 2000,
): Promise<DataSource> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const dataSource = create();
      await dataSource.initialize();
      return dataSource;
    } catch (error) {
      lastError = error;
      console.error(
        `[kebab-guide] Database connection attempt ${attempt}/${attempts} failed:`,
        (error as Error | null)?.message,
      );
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  console.log(`[kebab-guide] Starting in ${env.NODE_ENV} mode...`);
  const dataSource = await connectWithRetry(() => createDataSource());

  const app = createApp(dataSource);
  const server = app.listen(env.PORT, () => {
    console.log(`[kebab-guide] API        http://localhost:${env.PORT}/api/v1`);
    console.log(`[kebab-guide] Admin      http://localhost:${env.PORT}/admin`);
    console.log(`[kebab-guide] Health     http://localhost:${env.PORT}/health`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[kebab-guide] ${signal} received, shutting down...`);
    server.close(() => {
      void dataSource.destroy().finally(() => process.exit(0));
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[kebab-guide] Failed to start server:', error);
  process.exit(1);
});
