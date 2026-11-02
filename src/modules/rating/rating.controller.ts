import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload, toUploadedPhoto } from '../../middleware/upload';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { parseAndValidate } from '../../middleware/validate';
import { AppError } from '../../utils/http-error';
import { sendPhoto } from '../../utils/send-photo';
import { CreateRatingDto, ListRatingsQueryDto } from './rating.dto';
import { RatingService, toRatingResponse } from './rating.service';
import { requireUuid } from '../shop/shop.routes';

export class RatingController {
  /** Mounted at /shops/:shopId/ratings (mergeParams gives access to shopId). */
  public readonly nestedRouter: Router;
  /** Mounted at /ratings (lookup by rating id). */
  public readonly rootRouter: Router;

  constructor(private readonly ratings: RatingService) {
    this.nestedRouter = Router({ mergeParams: true });
    this.rootRouter = Router();

    this.nestedRouter.post(
      '/',
      apiWriteLimiter,
      optionalPhotoUpload('photo'),
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.shopId, 'Shop');
        const dto = await parseAndValidate(CreateRatingDto, req.body);
        const rating = await this.ratings.createForShop(req.params.shopId, dto, toUploadedPhoto(req.file));
        res.status(201).json({ data: toRatingResponse(rating) });
      }),
    );

    this.nestedRouter.get(
      '/',
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.shopId, 'Shop');
        const query = await parseAndValidate(ListRatingsQueryDto, req.query);
        // Public consumers only see validated ratings by default.
        const result = await this.ratings.listByShop(req.params.shopId, {
          page: query.page,
          limit: query.limit,
          isValidated: true,
        });
        res.json(result);
      }),
    );

    this.rootRouter.get(
      '/:id',
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.id, 'Rating');
        const rating = await this.ratings.getById(req.params.id);
        res.json({ data: toRatingResponse(rating) });
      }),
    );

    this.rootRouter.get(
      '/:id/photo',
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.id, 'Rating');
        const photo = await this.ratings.getPhoto(req.params.id);
        if (!photo) throw AppError.notFound('This rating has no photo.');
        sendPhoto(req, res, photo.buffer, photo.mimeType);
      }),
    );
  }
}
