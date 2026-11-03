import { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';

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

export function isAllowedImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
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
