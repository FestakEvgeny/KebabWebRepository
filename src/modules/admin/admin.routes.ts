import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { adminLoginLimiter } from '../../shared/middleware/admin-login-limiter';
import { AdminRouterDeps } from './admin-router-deps';
import { ensureCsrfToken, verifyCsrf } from './csrf';
import { flash } from './flash';
import { renderAdmin } from './render-admin';
import { requireAdmin } from './require-admin';
import { registerDashboardRoutes } from './dashboard.controller';
import { registerAdminShopRoutes } from './shops.controller';
import { registerAdminRatingRoutes } from './ratings.controller';

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * The server-rendered admin panel. This is the ONLY place with login and
 * moderation operations (validate/unvalidate shops and ratings) — every such
 * page requires an admin session, and every mutation is CSRF-protected.
 */
export function createAdminRouter({
  adminAuth,
  shopService,
  ratingService,
}: AdminRouterDeps): Router {
  const router = Router();
  const shops = shopService;
  const ratings = ratingService;

  // Every admin page needs a CSRF token in its forms.
  router.use((req: Request, res, next) => {
    ensureCsrfToken(req);
    next();
  });

  router.get('/login', (req: Request, res: Response) => {
    if (req.session.adminUserId) {
      res.redirect('/admin');
      return;
    }
    renderAdmin(req, res, 'login', { title: 'Sign in', active: '' });
  });

  router.post(
    '/login',
    adminLoginLimiter,
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password } = req.body as { email?: unknown; password?: unknown };
      if (typeof email !== 'string' || typeof password !== 'string') {
        flash(req, 'error', 'Please provide both email and password.');
        res.redirect('/admin/login');
        return;
      }

      const user = await adminAuth.verifyCredentials(email, password);

      if (!user) {
        flash(req, 'error', 'Invalid email or password.');
        res.status(401).redirect('/admin/login');
        return;
      }

      // Prevent session fixation: brand new session id after login.
      await regenerateSession(req);
      req.session.adminUserId = user.id;
      req.session.csrfToken = undefined;
      ensureCsrfToken(req);
      flash(req, 'success', 'Welcome back!');
      res.redirect('/admin');
    }),
  );

  router.post('/logout', requireAdmin, verifyCsrf, (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie('kebab.sid');
      res.redirect('/admin/login');
    });
  });

  router.use(requireAdmin);
  registerDashboardRoutes(router, shops, ratings);
  registerAdminShopRoutes(router, shops, ratings);
  registerAdminRatingRoutes(router, shops, ratings);

  return router;
}
