import 'reflect-metadata';
import path from 'node:path';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express, { Express } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import { DataSource } from 'typeorm';
import { env, isDevelopment } from './config/env';
import { createApiV1Router } from './api/v1.router';
import { createHealthRouter } from './modules/health/health.routes';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createMobileAppRouter } from './modules/mobileapp/mobileapp.routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

export function createApp(dataSource: DataSource): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('json escape', true);
  app.set('views', path.resolve(process.cwd(), 'frontend/views'));
  app.set('view engine', 'ejs');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
        },
      },
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins.includes('*') ? true : allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(
    morgan(isDevelopment ? 'dev' : 'combined', {
      skip: (req) => req.path === '/health' || req.path.startsWith('/assets'),
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  const PgSessionStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgSessionStore({
        conObject: {
          connectionString: env.DATABASE_URL,
          ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
        },
        tableName: 'admin_session',
      }),
      name: 'kebab.sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use('/assets', express.static(path.resolve(process.cwd(), 'frontend/public'), { maxAge: '1d' }));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  app.use('/health', createHealthRouter(dataSource));
  app.use('/api/v1', createApiV1Router(dataSource));
  app.use('/mobileapp/v1', createMobileAppRouter(dataSource));
  app.use('/admin', createAdminRouter(dataSource));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
