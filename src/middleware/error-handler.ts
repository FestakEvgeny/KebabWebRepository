import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { env, isProduction } from '../config/env';
import { AppError } from '../utils/app-error';

export function notFoundHandler(req: Request, res: Response): void {
  respond(req, res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${env.MAX_UPLOAD_MB} MB).`
        : `Upload failed: ${err.message}`;
    respond(req, res, 400, 'UPLOAD_ERROR', message);
    return;
  }

  if (err instanceof AppError) {
    respond(req, res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // PostgreSQL error codes worth translating into meaningful HTTP responses.
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === '22P02') {
    respond(req, res, 404, 'NOT_FOUND', 'Resource not found (malformed identifier).');
    return;
  }
  if (pgCode === '23505') {
    respond(req, res, 409, 'CONFLICT', 'A resource with the same unique value already exists.');
    return;
  }
  if (pgCode === '23503') {
    respond(req, res, 404, 'NOT_FOUND', 'Referenced resource does not exist.');
    return;
  }

  console.error('[kebab-guide] Unhandled error:', err);
  respond(
    req,
    res,
    500,
    'INTERNAL_ERROR',
    isProduction ? 'Internal server error.' : String((err as Error | null)?.message ?? err),
  );
}

function respond(
  req: Request,
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: { field: string; messages: string[] }[],
): void {
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/favicon.ico') {
    res.status(statusCode).json({ error: { code, message, ...(details ? { details } : {}) } });
    return;
  }
  res.status(statusCode).render('admin/error', {
    title: `Error ${statusCode}`,
    statusCode,
    message,
    active: '',
    flash: null,
    csrfToken: '',
    loggedIn: false,
    helpers: {},
  });
}
