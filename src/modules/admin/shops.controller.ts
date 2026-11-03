import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalPhotoUpload } from '../../middleware/upload';
import { toUploadedPhoto } from '../../utils/uploaded-photo';
import { parseAndValidate } from '../../middleware/validate';
import { AppError } from '../../utils/app-error';
import { CreateShopRequest } from '../shop/dto/create-shop-request.dto';
import { UpdateShopRequest } from '../shop/dto/update-shop-request.dto';
import { ShopService } from '../shop/shop.service';
import { toShopResponse } from '../shop/shop.mapper';
import { RatingService } from '../rating/rating.service';
import { buildPaginationVm } from './pagination-vm';
import { flattenErrorMessages } from './flatten-error-messages';
import { flash } from './flash';
import { renderAdmin } from './render-admin';
import { safeRedirectPath } from './safe-redirect-path';
import { verifyCsrf } from './csrf';

type StatusFilter = 'all' | 'pending' | 'validated';

function parseStatus(value: unknown): StatusFilter {
  return value === 'pending' || value === 'validated' ? value : 'all';
}

export function registerAdminShopRoutes(
  router: Router,
  shops: ShopService,
  ratings: RatingService,
): void {
  router.get(
    '/shops',
    asyncHandler(async (req: Request, res: Response) => {
      const status = parseStatus(req.query.status);
      const search =
        typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
      const result = await shops.list({
        page: req.query.page,
        limit: 20,
        isValidated: status === 'all' ? undefined : status === 'validated',
        search,
      });
      renderAdmin(req, res, 'shops/list', {
        title: 'Shops',
        active: 'shops',
        status,
        search,
        shops: result.data,
        pagination: buildPaginationVm(req, result.pagination),
      });
    }),
  );

  router.get('/shops/new', (req: Request, res: Response) => {
    renderAdmin(req, res, 'shops/form', {
      title: 'New shop',
      active: 'shops',
      action: '/admin/shops',
      submitLabel: 'Create shop',
      shop: undefined,
      values: {},
    });
  });

  router.post(
    '/shops',
    optionalPhotoUpload('photo'),
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const dto = await parseAndValidate(CreateShopRequest, req.body);
        const shop = await shops.create(dto, toUploadedPhoto(req.file));
        flash(req, 'success', `Shop "${shop.name}" created. It is pending validation.`);
        res.redirect(`/admin/shops/${shop.id}`);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 400) {
          res.status(400);
          renderAdmin(req, res, 'shops/form', {
            title: 'New shop',
            active: 'shops',
            action: '/admin/shops',
            submitLabel: 'Create shop',
            shop: undefined,
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
    '/shops/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const shop = await shops.getById(req.params.id);
      const shopRatings = await ratings.listByShop(shop.id, { page: 1, limit: 50 });
      renderAdmin(req, res, 'shops/show', {
        title: shop.name,
        active: 'shops',
        shop: toShopResponse(shop),
        shopRatings: shopRatings.data,
      });
    }),
  );

  router.get(
    '/shops/:id/edit',
    asyncHandler(async (req: Request, res: Response) => {
      const shop = await shops.getById(req.params.id);
      renderAdmin(req, res, 'shops/form', {
        title: `Edit ${shop.name}`,
        active: 'shops',
        action: `/admin/shops/${shop.id}/update`,
        submitLabel: 'Save changes',
        shop: toShopResponse(shop),
        values: {
          name: shop.name,
          latitude: shop.latitude,
          longitude: shop.longitude,
          isValidated: shop.isValidated,
        },
        errors: [],
      });
    }),
  );

  router.post(
    '/shops/:id/update',
    optionalPhotoUpload('photo'),
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      const shopId = req.params.id;
      try {
        const dto = await parseAndValidate(UpdateShopRequest, req.body);
        const removePhoto = req.body.removePhoto === 'on' || req.body.removePhoto === 'true';
        const shop = await shops.update(shopId, dto, {
          photo: toUploadedPhoto(req.file),
          removePhoto,
        });
        flash(req, 'success', `Shop "${shop.name}" updated.`);
        res.redirect(`/admin/shops/${shop.id}`);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 400) {
          const shop = await shops.getById(shopId).catch(() => null);
          res.status(400);
          renderAdmin(req, res, 'shops/form', {
            title: shop ? `Edit ${shop.name}` : 'Edit shop',
            active: 'shops',
            action: `/admin/shops/${shopId}/update`,
            submitLabel: 'Save changes',
            shop: shop ? toShopResponse(shop) : undefined,
            values: req.body,
            errors: flattenErrorMessages(error),
          });
          return;
        }
        throw error;
      }
    }),
  );

  const setShopValidation = (isValidated: boolean) => {
    return asyncHandler(async (req: Request, res: Response) => {
      const shop = await shops.setValidated(req.params.id, isValidated);
      flash(
        req,
        'success',
        `Shop "${shop.name}" ${isValidated ? 'validated' : 'moved back to pending'}.`,
      );
      res.redirect(safeRedirectPath(req.body?.redirectTo, `/admin/shops/${shop.id}`));
    });
  };
  router.post('/shops/:id/validate', verifyCsrf, setShopValidation(true));
  router.post('/shops/:id/unvalidate', verifyCsrf, setShopValidation(false));

  router.post(
    '/shops/:id/delete',
    verifyCsrf,
    asyncHandler(async (req: Request, res: Response) => {
      const shop = await shops.getById(req.params.id);
      await shops.remove(shop.id);
      flash(req, 'success', `Shop "${shop.name}" and all of its ratings were deleted.`);
      res.redirect(safeRedirectPath(req.body?.redirectTo, '/admin/shops'));
    }),
  );
}
