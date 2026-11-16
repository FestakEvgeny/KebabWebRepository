import { Inject, Injectable } from '@nestjs/common';
import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { apiWriteLimiter } from '../../shared/middleware/api-write-limiter';
import { optionalPhotoUpload } from '../../shared/middleware/optional-photo-upload';
import { toUploadedPhoto } from '../../shared/utils/photo/uploaded-photo';
import { parseAndValidate } from '../../shared/middleware/validate';
import { requireUuid } from '../../shared/utils/string/uuid';
import { sendPhoto } from '../../shared/utils/photo/send-photo';
import { AppError } from '../../shared/utils/error/app-error';
import { CreateRatingRequest } from './dto/create-rating-request.dto';
import { ListRatingsQuery } from './dto/list-ratings-query.dto';
import { RatingService } from './rating.service';
import { toRatingResponse } from './rating.mapper';

/**
 * Public rating endpoints. Mounted at /api/v1/shops/:shopId/ratings (nested)
 * and /api/v1/ratings (lookup by id). Every submission is stored as pending;
 * only admins can change moderation state.
 */
@Injectable()
export class RatingController {
  /** Mounted at /shops/:shopId/ratings (mergeParams gives access to shopId). */
  public readonly nestedRouter: Router;
  /** Mounted at /ratings (lookup by rating id). */
  public readonly rootRouter: Router;

  // Tokens are declared explicitly so DI works under the esbuild dev runner.
  constructor(@Inject(RatingService) private readonly ratings: RatingService) {
    this.nestedRouter = Router({ mergeParams: true });
    this.rootRouter = Router();

    this.nestedRouter.post(
      '/',
      apiWriteLimiter,
      optionalPhotoUpload('photo'),
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.shopId, 'Shop');
        const dto = await parseAndValidate(CreateRatingRequest, req.body);
        const rating = await this.ratings.createForShop(
          req.params.shopId,
          dto,
          toUploadedPhoto(req.file),
        );
        res.status(201).json({ data: toRatingResponse(rating) });
      }),
    );

    this.nestedRouter.get(
      '/',
      asyncHandler(async (req: Request, res: Response) => {
        requireUuid(req.params.shopId, 'Shop');
        const query = await parseAndValidate(ListRatingsQuery, req.query);
        // Public consumers only see validated ratings.
        const result = await this.ratings.listByShop(req.params.shopId, {
          page: query.page,
          limit: query.limit,
          isValidated: true,
        });
        res.json({
          data: result.data.map((rating) => toRatingResponse(rating)),
          pagination: result.pagination,
        });
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
