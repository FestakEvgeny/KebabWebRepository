import { Request, Response, NextFunction } from 'express';
import { PaginationMeta } from '../utils/pagination';
import { safeEqual, randomToken } from '../utils/crypto';

export interface FlashMessage {
  type: 'success' | 'error';
  message: string;
}

export function flash(req: Request, type: FlashMessage['type'], message: string): void {
  req.session.flash = { type, message };
}

export function consumeFlash(req: Request): FlashMessage | null {
  const value = req.session.flash ?? null;
  delete req.session.flash;
  return value;
}

export interface ViewHelpers {
  formatDate: (value?: Date | string | null) => string;
  truncate: (value?: string | null, max?: number) => string;
  fixed: (value?: number | null, digits?: number) => string;
}

export const viewHelpers: ViewHelpers = {
  formatDate: (value) =>
    value
      ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : '-',
  truncate: (value, max = 60) =>
    !value ? '' : value.length > max ? `${value.slice(0, max - 1)}...` : value,
  fixed: (value, digits = 2) =>
    value === null || value === undefined ? '-' : Number(value).toFixed(digits),
};

export interface AdminViewLocals {
  [key: string]: unknown;
}

/**
 * Renders a view inside the admin layout with the standard locals (flash,
 * CSRF token, helpers). Consumes the flash message for the current request.
 */
export function renderAdmin(
  req: Request,
  res: Response,
  view: string,
  locals: AdminViewLocals = {},
): void {
  const loggedIn = Boolean(req.session?.adminUserId);
  res.render(`admin/${view}`, {
    active: '',
    errors: [],
    ...locals,
    flash: consumeFlash(req),
    csrfToken: req.session?.csrfToken ?? '',
    loggedIn,
    helpers: viewHelpers,
  });
}

/** Only allows same-site relative paths, blocking open redirects. */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return fallback;
}

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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.adminUserId) {
    res.redirect('/admin/login');
    return;
  }
  next();
}

export interface PaginationVm {
  page: number;
  totalPages: number;
  total: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

/** Builds prev/next URLs that preserve the current filter query string. */
export function buildPaginationVm(req: Request, meta: PaginationMeta): PaginationVm {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string' && value !== '' && key !== 'page') {
      params.set(key, value);
    }
  }
  const urlFor = (page: number): string => {
    params.set('page', String(page));
    return `${req.path}?${params.toString()}`;
  };
  return {
    page: meta.page,
    totalPages: meta.totalPages,
    total: meta.total,
    prevUrl: meta.page > 1 ? urlFor(meta.page - 1) : null,
    nextUrl: meta.page < meta.totalPages ? urlFor(meta.page + 1) : null,
  };
}

export function flattenErrorMessages(error: { details?: { field: string; messages: string[] }[] }): string[] {
  if (error.details && error.details.length > 0) {
    return error.details.map((detail) => `${detail.field}: ${detail.messages.join(', ')}`);
  }
  return [error instanceof Error ? error.message : String(error)];
}
