import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload } from '../../middleware/upload';
import { toUploadedPhoto } from '../../utils/uploaded-photo';
import { parseAndValidate } from '../../middleware/validate';
import { AppError } from '../../utils/app-error';
import { ShopService } from '../shop/shop.service';
import { AdminCreateRatingRequest } from '../rating/dto/admin-create-rating-request.dto';
import { UpdateRatingRequest } from '../rating/dto/update-rating-request.dto';
import { RatingService } from '../rating/rating.service';
import { buildPaginationVm } from './pagination-vm';
import { flattenErrorMessages } from './flatten-error-messages';
import { flash } from './flash';
import { renderAdmin } from './render-admin';
import { safeRedirectPath } from './safe-redirect-path';
import { verifyCsrf } from './csrf';

function parseStatus(value: unknown): 'all' | 'pending' | 'validated' {
  return value === 'pending' || value === 'validated' ? value : 'all';
}

/** Recomputes the parent shop aggregates after any rating mutation. */
async function recompute(shops: ShopService, shopId: string): Promise<void> {
  await shops.recomputeAggregates(shopId);
}

export function registerAdminRatingRoutes(
  router: Router,
  shops: ShopService,
  ratings: RatingService,
): void {
  router.get(
    '/ratings',
    asyncHandler(async (req: Request, res: Response) => {
      const status = parseStatus(req.query.status);
      const shopId =
        typeof req.query.shopId === 'string' && req.query.shopId.trim()
          ? req.query.shopId.trim()
          : undefined;
      const search =
        typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
      const result = await ratings.listAdmin({
        page: req.query.page,
        limit: 20,
        status,
        shopId,
        search,
      });
      renderAdmin(req, res, 'ratings/list', {
        title: 'Ratings',
        active: 'ratings',
        status,
        shopId,
        search,
        ratings: result.data,
        pagination: buildPaginationVm(req, result.pagination),
      });
    }),
  );

  router.get(
    '/ratings/new',
    asyncHandler(async (req: Request, res: Response) => {
      const shopOptions = await shops.list({ page: 1, limit: 100 });
      renderAdmin(req, res, 'ratings/form', {
        title: 'New rating',
        active: 'ratings',
        action: '/admin/ratings',
        submitLabel: 'Create rating',
        rating: undefined,
        shopOptions: shopOptions.data,
        preselectedShopId: typeof req.query.shopId === 'string' ? req.query.shopId : '',
        values: {},
      });
    }),
  );

  router.post(
    '/ratings',
    optionalPhotoUpload('photo'),
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const dto = await parseAndValidate(AdminCreateRatingRequest, req.body);
        const rating = await ratings.createAsAdmin(dto, toUploadedPhoto(req.file));
        if (rating.isValidated) await recompute(shops, rating.shopId);
        flash(req, 'success', 'Rating created.');
        res.redirect(`/admin/shops/${rating.shopId}`);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 400) {
          const shopOptions = await shops.list({ page: 1, limit: 100 });
          res.status(400);
          renderAdmin(req, res, 'ratings/form', {
            title: 'New rating',
            active: 'ratings',
            action: '/admin/ratings',
            submitLabel: 'Create rating',
            rating: undefined,
            shopOptions: shopOptions.data,
            preselectedShopId: '',
            values: req.body,
            errors: flattenErrorMessages(error),
          });
          return;
        }
        throw error;
      }
    }),
  );

  router.get(
    '/ratings/:id/edit',
    asyncHandler(async (req: Request, res: Response) => {
      const rating = await ratings.getById(req.params.id);
      const shop = await shops.getById(rating.shopId);
      renderAdmin(req, res, 'ratings/form', {
        title: 'Edit rating',
        active: 'ratings',
        action: `/admin/ratings/${rating.id}/update`,
        submitLabel: 'Save changes',
        rating: {
          ...rating,
          hasPhoto: Boolean(rating.photoMimeType ?? rating.photo ?? null),
        },
        shopName: shop.name,
        shopOptions: [],
        preselectedShopId: rating.shopId,
        values: rating,
        errors: [],
      });
    }),
  );

  router.post(
    '/ratings/:id/update',
    optionalPhotoUpload('photo'),
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const dto = await parseAndValidate(UpdateRatingRequest, req.body);
        const removePhoto = req.body.removePhoto === 'on' || req.body.removePhoto === 'true';
        const rating = await ratings.update(req.params.id, dto, {
          photo: toUploadedPhoto(req.file),
          removePhoto,
        });
        await recompute(shops, rating.shopId);
        flash(req, 'success', 'Rating updated and shop aggregates recomputed.');
        res.redirect(safeRedirectPath(req.body?.redirectTo, '/admin/ratings'));
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 400) {
          const rating = await ratings.getById(req.params.id).catch(() => null);
          const shopName = rating ? (await shops.getById(rating.shopId).catch(() => null))?.name : undefined;
          res.status(400);
          renderAdmin(req, res, 'ratings/form', {
            title: 'Edit rating',
            active: 'ratings',
            action: `/admin/ratings/${req.params.id}/update`,
            submitLabel: 'Save changes',
            rating: rating
              ? { ...rating, hasPhoto: Boolean(rating.photoMimeType ?? rating.photo ?? null) }
              : undefined,
            shopName,
            shopOptions: [],
            preselectedShopId: rating?.shopId ?? '',
            values: req.body,
            errors: flattenErrorMessages(error),
          });
          return;
        }
        throw error;
      }
    }),
  );

  const setRatingValidation = (isValidated: boolean) => {
    return asyncHandler(async (req: Request, res: Response) => {
      const rating = await ratings.setValidated(req.params.id, isValidated);
      await recompute(shops, rating.shopId);
      flash(
        req,
        'success',
        `Rating ${isValidated ? 'validated' : 'moved back to pending'}; shop rating recomputed.`,
      );
      res.redirect(safeRedirectPath(req.body?.redirectTo, '/admin/ratings'));
    });
  };
  router.post('/ratings/:id/validate', verifyCsrf, setRatingValidation(true));
  router.post('/ratings/:id/unvalidate', verifyCsrf, setRatingValidation(false));

  router.post(
    '/ratings/:id/delete',
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      const rating = await ratings.getById(req.params.id);
      await ratings.remove(rating.id);
      await recompute(shops, rating.shopId);
      flash(req, 'success', 'Rating deleted and shop aggregates recomputed.');
      res.redirect(safeRedirectPath(req.body?.redirectTo, '/admin/ratings'));
    }),
  );
}
