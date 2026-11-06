import { Router } from 'express';
import { optionalPhotoUpload } from '../../middleware/upload';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { ShopController } from './shop.controller';
import { RatingController } from '../rating/rating.controller';

/**
 * Public shop endpoints mounted at /api/v1/shops:
 *
 *   POST /                submit a shop (stored pending until an admin validates it)
 *   GET  /                validated shops, paginated + search + geo filter
 *   GET  /all             every validated shop, no pagination
 *   GET  /:id             shop detail incl. validated ratings
 *   GET  /:id/photo       shop photo bytes
 *   POST /:shopId/ratings submit a rating (nested router from RatingController)
 *   GET  /:shopId/ratings validated ratings of a shop
 */
export function createShopRouter(shopController: ShopController, ratingController: RatingController): Router {
  const router = Router();

  router.post('/', apiWriteLimiter, optionalPhotoUpload('photo'), shopController.create);

  router.get('/all', shopController.listAll);
  router.get('/', shopController.list);
  router.get('/:id', shopController.getDetail);
  router.get('/:id/photo', shopController.getPhoto);

  // Ratings are a sub-resource of shops.
  router.use('/:shopId/ratings', ratingController.nestedRouter);

  return router;
}
