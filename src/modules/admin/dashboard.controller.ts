import { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { ShopService } from '../shop';
import { RatingService } from '../rating';
import { DashboardStats } from './dashboard-stats';
import { renderAdmin } from './render-admin';
import { toAdminRatingResponse } from './admin.mapper';

export function registerDashboardRoutes(
  router: Router,
  shops: ShopService,
  ratings: RatingService,
): void {
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      // The dashboard composes stats from both modules' public APIs.
      const [shopStats, ratingStats] = await Promise.all([shops.stats(), ratings.stats()]);
      const stats: DashboardStats = { ...shopStats, ...ratingStats };
      const pendingRatings = await ratings.listAdmin({ status: 'pending', page: 1, limit: 5 });
      renderAdmin(req, res, 'dashboard', {
        title: 'Dashboard',
        active: 'dashboard',
        stats,
        pendingRatings: pendingRatings.data.map((item) =>
          toAdminRatingResponse(item.rating, item.shopName),
        ),
      });
    }),
  );
}
