import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import path from 'node:path';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express, { Express, RequestHandler, Router } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import { DataSource } from 'typeorm';
import { env, isDevelopment } from './shared/config/env';
import { AppModule } from './app.module';
import { createApiV1Router } from './api/v1.router';
import { createHealthRouter } from './modules/health';
import { ADMIN_ROUTER } from './modules/admin';
import { AUTHENTICATE, OAUTH_ROUTER } from './modules/oauth';
import { RATINGS_NESTED_ROUTER, RATINGS_ROOT_ROUTER } from './modules/rating';
import { SHOP_ROUTER } from './modules/shop';
import { errorHandler } from './shared/middleware/error-handler';
import { notFoundHandler } from './shared/middleware/not-found-handler';

export async function createApp(dataSource: DataSource): Promise<Express> {
  // Composition root: boot the Nest DI container (standalone context, no HTTP
  // adapter) and mount the routers it produces onto Express. The shop detail
  // endpoint needs rating summaries and the rating module needs the shop
  // gateway, so the shop/rating module pair is wired through Nest's
  // forwardRef — see their *.module.ts files.
  const container = await NestFactory.createApplicationContext(AppModule.forRoot(dataSource), {
    logger: false,
  });

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

  app.use(
    '/assets',
    express.static(path.resolve(process.cwd(), 'frontend/public'), { maxAge: '1d' }),
  );
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  app.use('/health', createHealthRouter(container.get(DataSource)));
  app.use(
    '/api/v1',
    createApiV1Router({
      authenticate: container.get<RequestHandler>(AUTHENTICATE),
      oauthRouter: container.get<Router>(OAUTH_ROUTER),
      shopsRouter: container.get<Router>(SHOP_ROUTER),
      ratingsNestedRouter: container.get<Router>(RATINGS_NESTED_ROUTER),
      ratingsRootRouter: container.get<Router>(RATINGS_ROOT_ROUTER),
    }),
  );
  app.use('/admin', container.get<Router>(ADMIN_ROUTER));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
