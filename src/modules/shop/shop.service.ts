import { DataSource, Repository } from 'typeorm';
import { Shop } from '../../database/entities/shop.entity';
import { CreateShopRequest } from './dto/create-shop-request.dto';
import { UpdateShopRequest } from './dto/update-shop-request.dto';
import { ShopListResponse } from './dto/shop-list-response.dto';
import { ShopListFilters } from './shop-list-filters';
import { ShopStats } from './shop-stats';
import { toShopResponse } from './shop.mapper';
import { UploadedPhoto } from '../../utils/uploaded-photo';
import { PhotoUpdate } from '../../utils/photo-update';
import { AppError } from '../../utils/app-error';
import { parsePagination } from '../../utils/parse-pagination';
import { paginationMeta } from '../../utils/pagination-meta';
import { round2 } from '../../utils/math';
import { escapeLike } from '../../utils/escape-like';

/** Columns loaded for list queries; photo blobs are excluded to keep pages light. */
const SHOP_LIST_COLUMNS = [
  'shop.id',
  'shop.name',
  'shop.latitude',
  'shop.longitude',
  'shop.rating',
  'shop.countOfRates',
  'shop.photoMimeType',
  'shop.isValidated',
  'shop.createdAt',
  'shop.updatedAt',
];

const EARTH_RADIUS_KM = 6371;

export class ShopService {
  private readonly repo: Repository<Shop>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(Shop);
  }

  async create(dto: CreateShopRequest, photo?: UploadedPhoto): Promise<Shop> {
    const shop = this.repo.create({
      name: dto.name.trim(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      isValidated: false,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
    return this.repo.save(shop);
  }

  /** Every shop in one response, no pagination (mobile app); photo blobs excluded. */
  async listAll(): Promise<Shop[]> {
    return this.repo
      .createQueryBuilder('shop')
      .select(SHOP_LIST_COLUMNS)
      .orderBy('shop.createdAt', 'DESC')
      .getMany();
  }

  async getById(id: string): Promise<Shop> {
    const shop = await this.repo.findOneBy({ id });
    if (!shop) throw AppError.notFound(`Shop with id "${id}" was not found.`);
    return shop;
  }

  async list(filters: ShopListFilters): Promise<ShopListResponse> {
    const { page, limit, skip } = parsePagination(filters);
    const qb = this.repo.createQueryBuilder('shop').select(SHOP_LIST_COLUMNS);

    if (filters.isValidated !== undefined) {
      qb.andWhere('shop.isValidated = :isValidated', { isValidated: filters.isValidated });
    }
    if (filters.search) {
      qb.andWhere("shop.name ILIKE :search ESCAPE '\\'", {
        search: `%${escapeLike(filters.search)}%`,
      });
    }

    const useDistance =
      typeof filters.lat === 'number' && Number.isFinite(filters.lat) &&
      typeof filters.lng === 'number' && Number.isFinite(filters.lng);

    if (useDistance) {
      const distance = distanceExpression(filters.lat as number, filters.lng as number);
      qb.addSelect(distance, 'distance_km');
      if (typeof filters.radiusKm === 'number' && Number.isFinite(filters.radiusKm)) {
        qb.andWhere(`${distance} <= :radiusKm`, { radiusKm: filters.radiusKm });
      }
    }

    const total = await qb.getCount();

    if (useDistance) {
      const distance = distanceExpression(filters.lat as number, filters.lng as number);
      qb.orderBy(distance, 'ASC');
    } else {
      qb.orderBy('shop.createdAt', 'DESC');
    }
    qb.skip(skip).take(limit);

    const { raw, entities } = await qb.getRawAndEntities();
    const data = entities.map((shop, index) => {
      const response = toShopResponse(shop as Shop);
      if (useDistance) {
        const row = raw[index] as Record<string, unknown> | undefined;
        const distanceValue = Number(row?.distance_km ?? NaN);
        if (Number.isFinite(distanceValue)) response.distanceKm = round2(distanceValue);
      }
      return response;
    });

    return { data, pagination: paginationMeta(page, limit, total) };
  }

  async getPhoto(id: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const shop = await this.repo.findOne({
      where: { id },
      select: { id: true, photo: true, photoMimeType: true },
    });
    if (!shop || !shop.photo) return null;
    return { buffer: shop.photo, mimeType: shop.photoMimeType ?? 'application/octet-stream' };
  }

  async update(id: string, dto: UpdateShopRequest, photoUpdate: PhotoUpdate = {}): Promise<Shop> {
    const shop = await this.getById(id);
    shop.name = dto.name.trim();
    shop.latitude = dto.latitude;
    shop.longitude = dto.longitude;
    shop.isValidated = dto.isValidated;
    applyPhotoUpdate(shop, photoUpdate);
    return this.repo.save(shop);
  }

  async setValidated(id: string, isValidated: boolean): Promise<Shop> {
    const shop = await this.getById(id);
    shop.isValidated = isValidated;
    return this.repo.save(shop);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  /**
   * Recomputes shop.rating and shop.count_of_rates from the shop's validated
   * ratings. Overall score of one rating = mean of its three subscores.
   */
  async recomputeAggregates(shopId: string): Promise<void> {
    await this.repo.query(
      `UPDATE shop_table s
       SET rating = agg.avg_rating,
           count_of_rates = agg.rating_count,
           updated_at = now()
       FROM (
         SELECT
           ROUND(AVG((r.food_quality_rating + r.price_fair_rating + r.interior_rating) / 3.0)::numeric, 2) AS avg_rating,
           COUNT(*)::int AS rating_count
         FROM rating_table r
         WHERE r.shop_id = $1 AND r.is_validated = TRUE
       ) agg
       WHERE s.id = $1`,
      [shopId],
    );
  }

  async stats(): Promise<ShopStats> {
    const rows = (await this.repo.query(
      `SELECT
         (SELECT COUNT(*)::int FROM shop_table) AS total_shops,
         (SELECT COUNT(*)::int FROM shop_table WHERE is_validated = FALSE) AS pending_shops,
         (SELECT COUNT(*)::int FROM rating_table) AS total_ratings,
         (SELECT COUNT(*)::int FROM rating_table WHERE is_validated = FALSE) AS pending_ratings`,
    )) as Array<{
      total_shops: number;
      pending_shops: number;
      total_ratings: number;
      pending_ratings: number;
    }>;
    const row = rows[0];
    return {
      totalShops: row.total_shops,
      pendingShops: row.pending_shops,
      totalRatings: row.total_ratings,
      pendingRatings: row.pending_ratings,
    };
  }
}

function applyPhotoUpdate(shop: Shop, photoUpdate: PhotoUpdate): void {
  if (photoUpdate.photo) {
    shop.photo = photoUpdate.photo.buffer;
    shop.photoMimeType = photoUpdate.photo.mimeType;
  } else if (photoUpdate.removePhoto) {
    shop.photo = null;
    shop.photoMimeType = null;
  }
}

function distanceExpression(lat: number, lng: number): string {
  // lat/lng are validated finite numbers before reaching this point.
  return (
    `(${EARTH_RADIUS_KM} * acos(LEAST(1, GREATEST(-1, ` +
    `cos(radians(${lat})) * cos(radians(shop.latitude)) * cos(radians(shop.longitude) - radians(${lng})) + ` +
    `sin(radians(${lat})) * sin(radians(shop.latitude))))))`
  );
}
