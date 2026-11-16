import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { parsePagination } from '../../shared/utils/pagination/parse-pagination';
import { paginationMeta } from '../../shared/utils/pagination/pagination-meta';
import { escapeLike } from '../../shared/utils/string/escape-like';
import { Rating } from './rating.entity';
import { ListRatingsOptions } from './list-ratings-options';
import { AdminRatingListFilters } from './admin-rating-list-filters';
import { AdminRatingListItem } from './admin-rating-list-item';
import { RatingStats } from './rating-stats';
import { IRatingRepository, NewRating, RatingAggregate } from './rating.repository';

const RATING_LIST_COLUMNS = [
  'rating.id',
  'rating.shopId',
  'rating.foodQualityRating',
  'rating.priceFairRating',
  'rating.interiorRating',
  'rating.notes',
  'rating.photoMimeType',
  'rating.isValidated',
  'rating.createdAt',
  'rating.updatedAt',
];

/**
 * TypeORM-backed implementation of the rating repository port. It is the only
 * place in the rating module that touches the TypeORM repository for
 * rating_table; the service depends on IRatingRepository instead.
 */
@Injectable()
export class RatingRepositoryImpl implements IRatingRepository {
  private readonly repo: Repository<Rating>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(Rating);
  }

  async findById(id: string): Promise<Rating | null> {
    return this.repo.findOneBy({ id });
  }

  async findPhotoById(id: string): Promise<PhotoPayload | null> {
    const rating = await this.repo.findOne({
      where: { id },
      select: { id: true, photo: true, photoMimeType: true },
    });
    if (!rating || !rating.photo) return null;
    return { buffer: rating.photo, mimeType: rating.photoMimeType ?? 'application/octet-stream' };
  }

  async add(data: NewRating): Promise<Rating> {
    return this.repo.save(this.repo.create(data));
  }

  async save(rating: Rating): Promise<Rating> {
    return this.repo.save(rating);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async listByShop(shopId: string, options: ListRatingsOptions): Promise<PaginatedList<Rating>> {
    const { page, limit, skip } = parsePagination(options);
    const qb = this.repo
      .createQueryBuilder('rating')
      .select(RATING_LIST_COLUMNS)
      .where('rating.shopId = :shopId', { shopId });

    if (options.isValidated !== undefined) {
      qb.andWhere('rating.isValidated = :isValidated', { isValidated: options.isValidated });
    }

    const [ratings, total] = await qb
      .orderBy('rating.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data: ratings, pagination: paginationMeta(page, limit, total) };
  }

  async listValidatedByShop(shopId: string): Promise<Rating[]> {
    return this.repo.find({
      where: { shopId, isValidated: true },
      order: { createdAt: 'DESC' },
    });
  }

  async listAdmin(filters: AdminRatingListFilters): Promise<PaginatedList<AdminRatingListItem>> {
    const { page, limit, skip } = parsePagination(filters);
    const qb = this.repo
      .createQueryBuilder('rating')
      .select(RATING_LIST_COLUMNS)
      // Raw join on the shop table: the rating module does not map the shop
      // entity, it only needs the shop name for the admin listing.
      .leftJoin('shop_table', 'shop', 'shop.id = rating.shopId')
      .addSelect('shop.name', 'shop_name');

    const isValidated =
      filters.isValidated ??
      (filters.status === 'all' || !filters.status ? undefined : filters.status === 'validated');
    if (isValidated !== undefined) {
      qb.andWhere('rating.isValidated = :isValidated', { isValidated });
    }
    if (filters.shopId) {
      qb.andWhere('rating.shopId = :shopId', { shopId: filters.shopId });
    }
    if (filters.search) {
      qb.andWhere(
        "(rating.notes ILIKE :search ESCAPE '\\' OR shop.name ILIKE :search ESCAPE '\\')",
        {
          search: `%${escapeLike(filters.search)}%`,
        },
      );
    }

    const total = await qb.getCount();
    const { raw, entities } = await qb
      .orderBy('rating.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const data = entities.map((rating, index) => {
      const row = raw[index] as Record<string, unknown> | undefined;
      const shopName = typeof row?.shop_name === 'string' ? row.shop_name : undefined;
      return { rating, shopName };
    });

    return { data, pagination: paginationMeta(page, limit, total) };
  }

  async aggregateValidatedByShop(shopId: string): Promise<RatingAggregate> {
    const rows = (await this.repo.query(
      `SELECT
         ROUND(AVG((food_quality_rating + price_fair_rating + interior_rating) / 3.0)::numeric, 2) AS avg_rating,
         COUNT(*)::int AS rating_count
       FROM rating_table
       WHERE shop_id = $1 AND is_validated = TRUE`,
      [shopId],
    )) as Array<{ avg_rating: string | null; rating_count: number }>;
    const row = rows[0];
    return { averageRating: row.avg_rating ?? null, ratingCount: row.rating_count ?? 0 };
  }

  async stats(): Promise<RatingStats> {
    const rows = (await this.repo.query(
      `SELECT
         (SELECT COUNT(*)::int FROM rating_table) AS total_ratings,
         (SELECT COUNT(*)::int FROM rating_table WHERE is_validated = FALSE) AS pending_ratings`,
    )) as Array<{ total_ratings: number; pending_ratings: number }>;
    const row = rows[0];
    return { totalRatings: row.total_ratings, pendingRatings: row.pending_ratings };
  }
}
