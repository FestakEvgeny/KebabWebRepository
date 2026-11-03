import { Request, Response } from 'express';
import { consumeFlash } from './flash';
import { AdminViewLocals } from './admin-view-locals';
import { viewHelpers } from './view-helpers';

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
