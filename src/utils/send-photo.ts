import { Request, Response } from 'express';
import { createHash } from 'node:crypto';

/** Sends a stored photo buffer with content type, ETag and caching headers. */
export function sendPhoto(req: Request, res: Response, buffer: Buffer, mimeType: string): void {
  const etag = `"${createHash('sha1').update(buffer).digest('hex')}"`;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader('Content-Type', mimeType);
  res.status(200).end(buffer);
}
