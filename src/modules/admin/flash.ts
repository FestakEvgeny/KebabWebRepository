import { Request } from 'express';
import { FlashMessage } from './flash-message';

export function flash(req: Request, type: FlashMessage['type'], message: string): void {
  req.session.flash = { type, message };
}

export function consumeFlash(req: Request): FlashMessage | null {
  const value = req.session.flash ?? null;
  delete req.session.flash;
  return value;
}
