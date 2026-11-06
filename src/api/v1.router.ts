import { Router } from 'express';
import { ShopService } from '../modules/shop/shop.service';
import { ShopController } from '../modules/shop/shop.controller';
import { createShopRouter } from '../modules/shop/shop.routes';
import { RatingService } from '../modules/rating/rating.service';
import { RatingController } from '../modules/rating/rating.controller';

export interface ApiV1Deps {
  shopService: ShopService;
  ratingService: RatingService;
}

// API: /api/v1/...
export function createApiV1Router({ shopService, ratingService }: ApiV1Deps): Router {
  const router = Router();

  const shopController = new ShopController(shopService);
  const ratingController = new RatingController(ratingService);

  router.use('/shops', createShopRouter(shopController, ratingController));
  router.use('/ratings', ratingController.rootRouter);

  return router;
}
