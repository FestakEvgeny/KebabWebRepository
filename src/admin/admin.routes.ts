import * as bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { DataSource, Repository } from 'typeorm';
import { AdminUser } from '../database/entities/admin-user.entity';
import { asyncHandler } from '../middleware/async-handler';
import { adminLoginLimiter } from '../middleware/rate-limit';
import { ShopService } from '../modules/shop/shop.service';
import { RatingService } from '../modules/rating/rating.service';
import {
  ensureCsrfToken,
  flash,
  renderAdmin,
  requireAdmin,
  verifyCsrf,
} from './admin.helpers';
import { registerDashboardRoutes } from './admin.dashboard.controller';
import { registerAdminShopRoutes } from './admin.shops.controller';
import { registerAdminRatingRoutes } from './admin.ratings.controller';

// Constant hash used to equalise response times when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 12);

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function createAdminRouter(dataSource: DataSource): Router {
  const router = Router();
  const shops = new ShopService(dataSource);
  const ratings = new RatingService(dataSource);
  const adminRepo: Repository<AdminUser> = dataSource.getRepository(AdminUser);

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

      const user = await adminRepo.findOneBy({ email: email.trim().toLowerCase() });
      const passwordOk = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_HASH,
      );

      if (!user || !passwordOk) {
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
