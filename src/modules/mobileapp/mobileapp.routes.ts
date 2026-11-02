import { Request, Response, Router } from 'express';
import { DataSource } from 'typeorm';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload, toUploadedPhoto } from '../../middleware/upload';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { parseAndValidate } from '../../middleware/validate';
import { Shop } from '../../database/entities/shop.entity';
import { Rating } from '../../database/entities/rating.entity';
import { CreateShopDto } from '../shop/shop.dto';
import { ShopResponse, ShopService, toShopResponse } from '../shop/shop.service';
import { RatingResponse, RatingService, toRatingResponse } from '../rating/rating.service';
import { MobileAddRatingDto } from './mobileapp.dto';

/** Shop payload for the mobile app: the moderation flag is never exposed. */
export type MobileShopResponse = Omit<ShopResponse, 'isValidated'>;

/** Rating payload for the mobile app: the moderation flag is never exposed. */
export type MobileRatingResponse = Omit<RatingResponse, 'isValidated'>;

export function toMobileShopResponse(shop: Shop): MobileShopResponse {
  const { isValidated: _isValidated, ...rest } = toShopResponse(shop);
  return rest;
}

export function toMobileRatingResponse(rating: Rating): MobileRatingResponse {
  const { isValidated: _isValidated, ...rest } = toRatingResponse(rating);
  return rest;
}

/** Assembles the mobile app API: /mobileapp/v1/... */
export function createMobileAppRouter(dataSource: DataSource): Router {
  const router = Router();

  const shopService = new ShopService(dataSource);
  const ratingService = new RatingService(dataSource);

  // Full shop catalogue in one shot — no pagination, no moderation flag.
  router.get(
    '/allShops',
    asyncHandler(async (_req: Request, res: Response) => {
      const shops = await shopService.listAll();
      res.json({ data: shops.map(toMobileShopResponse) });
    }),
  );

  // Creates a pending shop (is_validated = false until an admin validates it).
  router.post(
    '/shop/add',
    apiWriteLimiter,
    optionalPhotoUpload('photo'),
    asyncHandler(async (req: Request, res: Response) => {
      const dto = await parseAndValidate(CreateShopDto, req.body);
      const shop = await shopService.create(dto, toUploadedPhoto(req.file));
      res.status(201).json({ data: toMobileShopResponse(shop) });
    }),
  );

  // Creates a pending rating; the shop is picked via shopId in the body.
  router.post(
    '/shop/addRating',
    apiWriteLimiter,
    optionalPhotoUpload('photo'),
    asyncHandler(async (req: Request, res: Response) => {
      const dto = await parseAndValidate(MobileAddRatingDto, req.body);
      const rating = await ratingService.createForShop(dto.shopId, dto, toUploadedPhoto(req.file));
      res.status(201).json({ data: toMobileRatingResponse(rating) });
    }),
  );

  return router;
}
