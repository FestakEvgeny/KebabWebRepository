import { Request, Response, Router } from 'express';
import { DataSource } from 'typeorm';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload } from '../../middleware/upload';
import { toUploadedPhoto } from '../../utils/uploaded-photo';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { parseAndValidate } from '../../middleware/validate';
import { CreateShopRequest } from '../shop/dto/create-shop-request.dto';
import { ShopService } from '../shop/shop.service';
import { RatingService } from '../rating/rating.service';
import { MobileAddRatingRequest } from './dto/mobile-add-rating-request.dto';
import { toMobileShopResponse, toMobileRatingResponse } from './mobileapp.mapper';

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
      const dto = await parseAndValidate(CreateShopRequest, req.body);
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
      const dto = await parseAndValidate(MobileAddRatingRequest, req.body);
      const rating = await ratingService.createForShop(dto.shopId, dto, toUploadedPhoto(req.file));
      res.status(201).json({ data: toMobileRatingResponse(rating) });
    }),
  );

  return router;
}
