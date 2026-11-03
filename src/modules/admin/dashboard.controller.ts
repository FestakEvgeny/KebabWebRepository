import { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { ShopService } from '../shop/shop.service';
import { RatingService } from '../rating/rating.service';
import { renderAdmin } from './render-admin';

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
