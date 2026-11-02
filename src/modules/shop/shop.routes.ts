import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload, toUploadedPhoto } from '../../middleware/upload';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { parseAndValidate } from '../../middleware/validate';
import { AppError, isUuid } from '../../utils/http-error';
import { sendPhoto } from '../../utils/send-photo';
import { Router } from 'express';
import { CreateShopDto, ListShopsQueryDto } from './shop.dto';
import { ShopService, toShopResponse } from './shop.service';
import { RatingController } from '../rating/rating.controller';

export function createShopRouter(shopService: ShopService, ratingController: RatingController): Router {
  const router = Router();

  router.post(
    '/',
    apiWriteLimiter,
    optionalPhotoUpload('photo'),
    asyncHandler(async (req: Request, res: Response) => {
      const dto = await parseAndValidate(CreateShopDto, req.body);
      const shop = await shopService.create(dto, toUploadedPhoto(req.file));
      res.status(201).json({ data: toShopResponse(shop) });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const query = await parseAndValidate(ListShopsQueryDto, req.query);
      res.json(
        await shopService.list({
          page: query.page,
          limit: query.limit,
          isValidated: query.isValidated,
          search: query.search?.trim() || undefined,
          lat: query.lat,
          lng: query.lng,
          radiusKm: query.radiusKm,
        }),
      );
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      requireUuid(req.params.id, 'Shop');
      const shop = await shopService.getById(req.params.id);
      res.json({ data: toShopResponse(shop) });
    }),
  );

  router.get(
    '/:id/photo',
    asyncHandler(async (req: Request, res: Response) => {
      requireUuid(req.params.id, 'Shop');
      const photo = await shopService.getPhoto(req.params.id);
      if (!photo) throw AppError.notFound('This shop has no photo.');
      sendPhoto(req, res, photo.buffer, photo.mimeType);
    }),
  );

  // Ratings are a sub-resource of shops.
  router.use('/:shopId/ratings', ratingController.nestedRouter);

  return router;
}

export function requireUuid(value: string, resource: string): void {
  if (!isUuid(value)) {
    throw AppError.notFound(`${resource} with id "${value}" was not found.`);
  }
}
