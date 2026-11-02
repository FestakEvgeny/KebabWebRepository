import { Router } from 'express';
import { DataSource } from 'typeorm';
import { ShopService } from '../modules/shop/shop.service';
import { createShopRouter } from '../modules/shop/shop.routes';
import { RatingService } from '../modules/rating/rating.service';
import { RatingController } from '../modules/rating/rating.controller';

/** Assembles the versioned public API: /api/v1/... */
export function createApiV1Router(dataSource: DataSource): Router {
  const router = Router();

  const shopService = new ShopService(dataSource);
  const ratingService = new RatingService(dataSource);
  const ratingController = new RatingController(ratingService);

  router.use('/shops', createShopRouter(shopService, ratingController));
  router.use('/ratings', ratingController.rootRouter);

  return router;
}
