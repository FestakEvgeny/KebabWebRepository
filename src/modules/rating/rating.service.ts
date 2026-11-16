import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Rating } from './rating.entity';
import { CreateRatingRequest } from './dto/create-rating-request.dto';
import { AdminCreateRatingRequest } from './dto/admin-create-rating-request.dto';
import { UpdateRatingRequest } from './dto/update-rating-request.dto';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { ListRatingsOptions } from './list-ratings-options';
import { AdminRatingListFilters } from './admin-rating-list-filters';
import { AdminRatingListItem } from './admin-rating-list-item';
import { RatingStats } from './rating-stats';
import { ShopGateway } from './shop-gateway';
import { ShopRatingSummary, ShopService } from '../shop';
import { UploadedPhoto } from '../../shared/utils/photo/uploaded-photo';
import { PhotoUpdate } from '../../shared/utils/photo/photo-update';
import { AppError } from '../../shared/utils/error/app-error';
import { parsePagination } from '../../shared/utils/pagination/parse-pagination';
import { paginationMeta } from '../../shared/utils/pagination/pagination-meta';
import { escapeLike } from '../../shared/utils/string/escape-like';
import { toRatingResponse } from './rating.mapper';

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

function normalizeNotes(notes?: string | null): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class RatingService {
  private readonly repo: Repository<Rating>;

  constructor(
    // Tokens are declared explicitly (instead of relying on reflected
    // paramtypes) so the DI graph survives the esbuild-based dev runner.
    @Inject(DataSource) ds: DataSource,
    // The gateway is the shop module's ShopService; the module pair imports
    // each other via forwardRef because the shop side reads ratings back.
    @Inject(forwardRef(() => ShopService)) private readonly shops: ShopGateway,
  ) {
    this.repo = ds.getRepository(Rating);
  }

  /** Creates a pending rating via the public API (is_validated always false). */
  async createForShop(
    shopId: string,
    dto: CreateRatingRequest,
    photo?: UploadedPhoto,
  ): Promise<Rating> {
    if (!(await this.shops.exists(shopId))) {
      throw AppError.notFound(`Shop with id "${shopId}" was not found.`);
    }

    const rating = this.repo.create({
      shopId,
      foodQualityRating: dto.foodQualityRating,
      priceFairRating: dto.priceFairRating,
      interiorRating: dto.interiorRating,
      notes: normalizeNotes(dto.notes),
      isValidated: false,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
    return this.repo.save(rating);
  }

  async createAsAdmin(dto: AdminCreateRatingRequest, photo?: UploadedPhoto): Promise<Rating> {
    if (!(await this.shops.exists(dto.shopId))) {
      throw AppError.notFound(`Shop with id "${dto.shopId}" was not found.`);
    }

    const rating = this.repo.create({
      shopId: dto.shopId,
      foodQualityRating: dto.foodQualityRating,
      priceFairRating: dto.priceFairRating,
      interiorRating: dto.interiorRating,
      notes: normalizeNotes(dto.notes),
      isValidated: dto.isValidated,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
    const saved = await this.repo.save(rating);
    if (saved.isValidated) await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async getById(id: string): Promise<Rating> {
    const rating = await this.repo.findOneBy({ id });
    if (!rating) throw AppError.notFound(`Rating with id "${id}" was not found.`);
    return rating;
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

  /** Validated ratings for one shop, newest first, in the shop module's summary shape. */
  async listValidatedSummaries(shopId: string): Promise<ShopRatingSummary[]> {
    const ratings = await this.repo.find({
      where: { shopId, isValidated: true },
      order: { createdAt: 'DESC' },
    });
    return ratings.map((rating) => toRatingResponse(rating));
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

  async getPhoto(id: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const rating = await this.repo.findOne({
      where: { id },
      select: { id: true, photo: true, photoMimeType: true },
    });
    if (!rating || !rating.photo) return null;
    return { buffer: rating.photo, mimeType: rating.photoMimeType ?? 'application/octet-stream' };
  }

  async update(
    id: string,
    dto: UpdateRatingRequest,
    photoUpdate: PhotoUpdate = {},
  ): Promise<Rating> {
    const rating = await this.getById(id);
    rating.foodQualityRating = dto.foodQualityRating;
    rating.priceFairRating = dto.priceFairRating;
    rating.interiorRating = dto.interiorRating;
    rating.notes = normalizeNotes(dto.notes);
    rating.isValidated = dto.isValidated;
    if (photoUpdate.photo) {
      rating.photo = photoUpdate.photo.buffer;
      rating.photoMimeType = photoUpdate.photo.mimeType;
    } else if (photoUpdate.removePhoto) {
      rating.photo = null;
      rating.photoMimeType = null;
    }
    const saved = await this.repo.save(rating);
    await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async setValidated(id: string, isValidated: boolean): Promise<Rating> {
    const rating = await this.getById(id);
    rating.isValidated = isValidated;
    const saved = await this.repo.save(rating);
    await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const rating = await this.getById(id);
    await this.repo.delete(id);
    await this.recomputeAggregate(rating.shopId);
  }

  /**
   * Recomputes the denormalized aggregates for one shop from the shop's
   * validated ratings and pushes them onto the shop row via the gateway.
   * Overall score of one rating = mean of its three subscores.
   */
  private async recomputeAggregate(shopId: string): Promise<void> {
    const rows = (await this.repo.query(
      `SELECT
         ROUND(AVG((food_quality_rating + price_fair_rating + interior_rating) / 3.0)::numeric, 2) AS avg_rating,
         COUNT(*)::int AS rating_count
       FROM rating_table
       WHERE shop_id = $1 AND is_validated = TRUE`,
      [shopId],
    )) as Array<{ avg_rating: string | null; rating_count: number }>;
    const row = rows[0];
    await this.shops.applyRatingAggregates(shopId, row.avg_rating ?? null, row.rating_count ?? 0);
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
