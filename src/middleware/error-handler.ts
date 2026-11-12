import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { env, isProduction } from '../config/env';
import { AppError } from '../utils/error/app-error';
import { sendErrorResponse } from './send-error-response';

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
    sendErrorResponse(req, res, 400, 'UPLOAD_ERROR', message);
    return;
  }

  if (err instanceof AppError) {
    sendErrorResponse(req, res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // PostgreSQL error codes worth translating into meaningful HTTP responses.
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === '22P02') {
    sendErrorResponse(req, res, 404, 'NOT_FOUND', 'Resource not found (malformed identifier).');
    return;
  }
  if (pgCode === '23505') {
    sendErrorResponse(
      req,
      res,
      409,
      'CONFLICT',
      'A resource with the same unique value already exists.',
    );
    return;
  }
  if (pgCode === '23503') {
    sendErrorResponse(req, res, 404, 'NOT_FOUND', 'Referenced resource does not exist.');
    return;
  }

  console.error('[kebab-guide] Unhandled error:', err);
  sendErrorResponse(
    req,
    res,
    500,
    'INTERNAL_ERROR',
    isProduction ? 'Internal server error.' : String((err as Error | null)?.message ?? err),
  );
}
