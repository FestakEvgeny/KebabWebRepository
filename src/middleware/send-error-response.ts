import { Request, Response } from 'express';

/**
 * Sends an error as JSON for API paths or renders the admin error page for
 * everything else — the shared tail of every error path in the app.
 */
export function sendErrorResponse(
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
