import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { toUploadedPhoto } from '../../utils/photo/uploaded-photo';
import { AppError } from '../../utils/error/app-error';
import { requireUuid } from '../../utils/string/uuid';
import { sendPhoto } from '../../utils/photo/send-photo';
import { parseAndValidate } from '../../middleware/validate';
import { CreateShopRequest } from './dto/create-shop-request.dto';
import { ListShopsQuery } from './dto/list-shops-query.dto';
import { ShopService } from './shop.service';
import { toShopDetailResponse, toShopResponse } from './shop.mapper';

/**
 * HTTP handlers for the public shop API served at /api/v1/shops.
 * Routers own middleware and paths; this class owns request parsing and
 * response shapes only.
 */
export class ShopController {
  constructor(private readonly shops: ShopService) {}

  /** POST /shops — public submission, always stored as pending. */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = await parseAndValidate(CreateShopRequest, req.body);
    const shop = await this.shops.create(dto, toUploadedPhoto(req.file));
    res.status(201).json({ data: toShopResponse(shop) });
  });

  /** GET /shops — public catalogue: validated shops only, paginated. */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = await parseAndValidate(ListShopsQuery, req.query);
    const result = await this.shops.list({
      page: query.page,
      limit: query.limit,
      isValidated: true,
      search: query.search?.trim() || undefined,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
    });
    res.json({
      data: result.data.map((shop) => toShopResponse(shop, shop.distanceKm)),
      pagination: result.pagination,
    });
  });

  /** GET /shops/all — every validated shop in one shot (mobile catalogue). */
  listAll = asyncHandler(async (_req: Request, res: Response) => {
    const shops = await this.shops.listAll();
    res.json({ data: shops.map((shop) => toShopResponse(shop)) });
  });

  /** GET /shops/:id — shop detail including its validated ratings. */
  getDetail = asyncHandler(async (req: Request, res: Response) => {
    requireUuid(req.params.id, 'Shop');
    const shop = await this.shops.getByIdWithRatings(req.params.id);
    res.json({ data: toShopDetailResponse(shop) });
  });

  /** GET /shops/:id/photo — the photo bytes, 404 when the shop has none. */
  getPhoto = asyncHandler(async (req: Request, res: Response) => {
    requireUuid(req.params.id, 'Shop');
    const photo = await this.shops.getPhoto(req.params.id);
    if (!photo) throw AppError.notFound('This shop has no photo.');
    sendPhoto(req, res, photo.buffer, photo.mimeType);
  });
}
