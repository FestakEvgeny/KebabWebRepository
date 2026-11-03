import { NextFunction, Request, Response } from 'express';
import { randomToken, safeEqual } from '../../utils/crypto';
import { viewHelpers } from './view-helpers';

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomToken(24);
  }
  return req.session.csrfToken;
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const submitted = (req.body as Record<string, unknown> | undefined)?._csrf;
  const sessionToken = req.session?.csrfToken;
  if (
    typeof submitted !== 'string' ||
    !sessionToken ||
    !safeEqual(submitted, sessionToken)
  ) {
    res.status(403).render('admin/error', {
      title: 'Error 403',
      statusCode: 403,
      message: 'Invalid or missing CSRF token. Please go back and try again.',
      active: '',
      flash: null,
      csrfToken: '',
      loggedIn: Boolean(req.session?.adminUserId),
      helpers: viewHelpers,
    });
    return;
  }
  next();
}
