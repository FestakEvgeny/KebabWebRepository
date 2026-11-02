import 'dotenv/config';
import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://kebab:kebab@localhost:5432/kebab_guide'),
  DATABASE_SSL: booleanFlag,

  RUN_MIGRATIONS_ON_START: booleanFlag.default('true'),
  SEED_SAMPLE_DATA: booleanFlag,

  SESSION_SECRET: z.string().min(32).default('dev-session-secret-please-change-me!'),
  ADMIN_EMAIL: z.string().email().default('admin@kebab.guide'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),

  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(5),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[kebab-guide] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

const DEV_SESSION_SECRET = 'dev-session-secret-please-change-me!';
if (isProduction && env.SESSION_SECRET === DEV_SESSION_SECRET) {
  console.error(
    '[kebab-guide] SESSION_SECRET still uses the development default. Set a strong secret before deploying.',
  );
  process.exit(1);
}
