import { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/http-error';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 30 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImageMime(file.mimetype)) {
      cb(
        AppError.badRequest(
          `Only image files are allowed, received "${file.mimetype}".`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

export interface UploadedPhoto {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export function isAllowedImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function toUploadedPhoto(file?: Express.Multer.File): UploadedPhoto | undefined {
  if (!file) return undefined;
  return { buffer: file.buffer, mimeType: file.mimetype, size: file.size };
}

/**
 * Parses a `photo` file field only when the request is multipart, so the same
 * route transparently supports JSON bodies (no photo) and multipart (photo).
 */
export function optionalPhotoUpload(field: string): RequestHandler {
  return (req: Request, res: Response, next) => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }
    upload.single(field)(req, res, next);
  };
}
