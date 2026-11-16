import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Shop } from './shop.entity';
import { CreateShopRequest } from './dto/create-shop-request.dto';
import { UpdateShopRequest } from './dto/update-shop-request.dto';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { ShopListFilters } from './shop-list-filters';
import { ShopListItem } from './shop-list-item';
import { ShopStats } from './shop-stats';
import { ShopRatingsReader, ShopRatingSummary, SHOP_RATINGS_READER } from './shop-rating-reader';
import { UploadedPhoto } from '../../shared/utils/photo/uploaded-photo';
import { PhotoUpdate } from '../../shared/utils/photo/photo-update';
import { AppError } from '../../shared/utils/error/app-error';
import { parsePagination } from '../../shared/utils/pagination/parse-pagination';
import { paginationMeta } from '../../shared/utils/pagination/pagination-meta';
import { round2 } from '../../shared/utils/math/math';
import { escapeLike } from '../../shared/utils/string/escape-like';

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

@Injectable()
export class ShopService {
  private readonly repo: Repository<Shop>;

  constructor(
    // Tokens are declared explicitly (instead of relying on reflected
    // paramtypes) so the DI graph survives the esbuild-based dev runner.
    @Inject(DataSource) ds: DataSource,
    // The reader is implemented by the rating module, whose service needs the
    // shop gateway in return; forwardRef keeps that mutual wiring resolvable.
    @Inject(forwardRef(() => SHOP_RATINGS_READER))
    private readonly ratingsReader: ShopRatingsReader,
  ) {
    this.repo = ds.getRepository(Shop);
  }

  /** Existence check exposed to the rating module via its ShopGateway port. */
  async exists(id: string): Promise<boolean> {
    const count = await this.repo.count({ where: { id } });
    return count > 0;
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

  async listAll(): Promise<Shop[]> {
    return this.repo
      .createQueryBuilder('shop')
      .select(SHOP_LIST_COLUMNS)
      .where('shop.isValidated = :isValidated', { isValidated: true })
      .orderBy('shop.createdAt', 'DESC')
      .getMany();
  }

  async getById(id: string): Promise<Shop> {
    const shop = await this.repo.findOneBy({ id });
    if (!shop) throw AppError.notFound(`Shop with id "${id}" was not found.`);
    return shop;
  }

  async getByIdWithRatings(id: string): Promise<{ shop: Shop; ratings: ShopRatingSummary[] }> {
    const shop = await this.getById(id);
    const ratings = await this.ratingsReader.listValidatedByShop(id);
    return { shop, ratings };
  }

  async list(filters: ShopListFilters): Promise<PaginatedList<ShopListItem>> {
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
      typeof filters.lat === 'number' &&
      Number.isFinite(filters.lat) &&
      typeof filters.lng === 'number' &&
      Number.isFinite(filters.lng);

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
    const items = entities as ShopListItem[];
    if (useDistance) {
      for (const [index, shop] of items.entries()) {
        const row = raw[index] as Record<string, unknown> | undefined;
        const distanceValue = Number(row?.distance_km ?? NaN);
        if (Number.isFinite(distanceValue)) shop.distanceKm = round2(distanceValue);
      }
    }

    return { data: items, pagination: paginationMeta(page, limit, total) };
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
   * Stores the rating-derived aggregates on the shop row. The rating module
   * computes the values from its own data and calls this through its
   * ShopGateway port — the source of truth never leaves the rating module.
   */
  async applyRatingAggregates(
    shopId: string,
    rating: string | null,
    countOfRates: number,
  ): Promise<void> {
    await this.repo.query(
      `UPDATE shop_table
       SET rating = $2, count_of_rates = $3, updated_at = now()
       WHERE id = $1`,
      [shopId, rating, countOfRates],
    );
  }

  async stats(): Promise<ShopStats> {
    const rows = (await this.repo.query(
      `SELECT
         (SELECT COUNT(*)::int FROM shop_table) AS total_shops,
         (SELECT COUNT(*)::int FROM shop_table WHERE is_validated = FALSE) AS pending_shops`,
    )) as Array<{ total_shops: number; pending_shops: number }>;
    const row = rows[0];
    return { totalShops: row.total_shops, pendingShops: row.pending_shops };
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
