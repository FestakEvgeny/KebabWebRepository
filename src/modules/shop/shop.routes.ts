import { Router } from 'express';
import { optionalPhotoUpload } from '../../middleware/optional-photo-upload';
import { apiWriteLimiter } from '../../middleware/api-write-limiter';
import { ShopController } from './shop.controller';
import { RatingController } from '../rating/rating.controller';

export function createShopRouter(
  shopController: ShopController,
  ratingController: RatingController,
): Router {
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
