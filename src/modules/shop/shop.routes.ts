import { Router } from 'express';
import { optionalPhotoUpload } from '../../shared/middleware/optional-photo-upload';
import { apiWriteLimiter } from '../../shared/middleware/api-write-limiter';
import { ShopController } from './shop.controller';

export function createShopRouter(shopController: ShopController): Router {
  const router = Router();

  router.post('/', apiWriteLimiter, optionalPhotoUpload('photo'), shopController.create);

  router.get('/all', shopController.listAll);
  router.get('/', shopController.list);
  router.get('/:id', shopController.getDetail);
  router.get('/:id/photo', shopController.getPhoto);

  return router;
}
