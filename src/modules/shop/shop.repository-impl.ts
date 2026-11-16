import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { parsePagination } from '../../shared/utils/pagination/parse-pagination';
import { paginationMeta } from '../../shared/utils/pagination/pagination-meta';
import { round2 } from '../../shared/utils/math/math';
import { escapeLike } from '../../shared/utils/string/escape-like';
import { Shop } from './shop.entity';
import { ShopListFilters } from './shop-list-filters';
import { ShopListItem } from './shop-list-item';
import { ShopStats } from './shop-stats';
import { IShopRepository, NewShop } from './shop.repository';

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

/**
 * TypeORM-backed implementation of the shop repository port. It is the only
 * place in the shop module that touches the TypeORM repository for
 * shop_table; the service depends on IShopRepository instead.
 */
@Injectable()
export class ShopRepositoryImpl implements IShopRepository {
  private readonly repo: Repository<Shop>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(Shop);
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.repo.count({ where: { id } });
    return count > 0;
  }

  async findById(id: string): Promise<Shop | null> {
    return this.repo.findOneBy({ id });
  }

  async findPhotoById(id: string): Promise<PhotoPayload | null> {
    const shop = await this.repo.findOne({
      where: { id },
      select: { id: true, photo: true, photoMimeType: true },
    });
    if (!shop || !shop.photo) return null;
    return { buffer: shop.photo, mimeType: shop.photoMimeType ?? 'application/octet-stream' };
  }

  async add(data: NewShop): Promise<Shop> {
    const shop = this.repo.create({
      isValidated: false,
      ...data,
    });
    return this.repo.save(shop);
  }

  async save(shop: Shop): Promise<Shop> {
    return this.repo.save(shop);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async listValidated(): Promise<Shop[]> {
    return this.repo
      .createQueryBuilder('shop')
      .select(SHOP_LIST_COLUMNS)
      .where('shop.isValidated = :isValidated', { isValidated: true })
      .orderBy('shop.createdAt', 'DESC')
      .getMany();
  }

  async listFiltered(filters: ShopListFilters): Promise<PaginatedList<ShopListItem>> {
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

  /**
   * Stores the rating-derived aggregates on the shop row. The rating module
   * computes the values from its own data and pushes them here through the
   * shop service — the source of truth never leaves the rating module.
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

function distanceExpression(lat: number, lng: number): string {
  // lat/lng are validated finite numbers before reaching this point.
  return (
    `(${EARTH_RADIUS_KM} * acos(LEAST(1, GREATEST(-1, ` +
    `cos(radians(${lat})) * cos(radians(shop.latitude)) * cos(radians(shop.longitude) - radians(${lng})) + ` +
    `sin(radians(${lat})) * sin(radians(shop.latitude))))))`
  );
}
