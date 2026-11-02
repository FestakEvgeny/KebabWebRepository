import { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ShopService } from '../modules/shop/shop.service';
import { RatingService } from '../modules/rating/rating.service';
import { renderAdmin } from './admin.helpers';

export function registerDashboardRoutes(
  router: Router,
  shops: ShopService,
  ratings: RatingService,
): void {
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const stats = await shops.stats();
      const pendingRatings = await ratings.listAdmin({ status: 'pending', page: 1, limit: 5 });
      renderAdmin(req, res, 'dashboard', {
        title: 'Dashboard',
        active: 'dashboard',
        stats,
        pendingRatings: pendingRatings.data,
      });
    }),
  );
}
