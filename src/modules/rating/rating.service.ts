import { DataSource, Repository } from 'typeorm';
import { Rating } from '../../database/entities/rating.entity';
import { Shop } from '../../database/entities/shop.entity';
import { AdminCreateRatingDto, CreateRatingDto, UpdateRatingDto } from './rating.dto';
import { UploadedPhoto } from '../../middleware/upload';
import { AppError } from '../../utils/http-error';
import { parsePagination, paginationMeta, PaginationMeta } from '../../utils/pagination';
import { escapeLike, PhotoUpdate, round2 } from '../shop/shop.service';

export interface RatingResponse {
  id: string;
  shopId: string;
  shopName?: string;
  foodQualityRating: number;
  priceFairRating: number;
  interiorRating: number;
  overallRating: number;
  notes: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  isValidated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedRatings {
  data: RatingResponse[];
  pagination: PaginationMeta;
}

export interface ListRatingsOptions {
  page?: unknown;
  limit?: unknown;
  /** Filter by moderation status; omit to return everything. */
  isValidated?: boolean;
}

export interface AdminRatingListFilters extends ListRatingsOptions {
  status?: 'all' | 'pending' | 'validated';
  shopId?: string;
  search?: string;
}

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

export function toRatingResponse(rating: Rating, shopName?: string): RatingResponse {
  const hasPhoto = Boolean(rating.photo ?? null) || Boolean(rating.photoMimeType ?? null);
  return {
    id: rating.id,
    shopId: rating.shopId,
    ...(shopName !== undefined ? { shopName } : {}),
    foodQualityRating: rating.foodQualityRating,
    priceFairRating: rating.priceFairRating,
    interiorRating: rating.interiorRating,
    overallRating: round2(
      (rating.foodQualityRating + rating.priceFairRating + rating.interiorRating) / 3,
    ),
    notes: rating.notes ?? null,
    hasPhoto,
    photoUrl: hasPhoto ? `/api/v1/ratings/${rating.id}/photo` : null,
    isValidated: rating.isValidated,
    createdAt:
      rating.createdAt instanceof Date ? rating.createdAt.toISOString() : String(rating.createdAt),
    updatedAt:
      rating.updatedAt instanceof Date ? rating.updatedAt.toISOString() : String(rating.updatedAt),
  };
}

export function normalizeNotes(notes?: string | null): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

export class RatingService {
  private readonly repo: Repository<Rating>;
  private readonly shopRepo: Repository<Shop>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(Rating);
    this.shopRepo = ds.getRepository(Shop);
  }

  /** Creates a pending rating via the public API (is_validated always false). */
  async createForShop(shopId: string, dto: CreateRatingDto, photo?: UploadedPhoto): Promise<Rating> {
    const shop = await this.shopRepo.findOneBy({ id: shopId });
    if (!shop) throw AppError.notFound(`Shop with id "${shopId}" was not found.`);

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

  async createAsAdmin(dto: AdminCreateRatingDto, photo?: UploadedPhoto): Promise<Rating> {
    const shop = await this.shopRepo.findOneBy({ id: dto.shopId });
    if (!shop) throw AppError.notFound(`Shop with id "${dto.shopId}" was not found.`);

    const rating = this.repo.create({
      shopId: dto.shopId,
      foodQualityRating: dto.foodQualityRating,
      priceFairRating: dto.priceFairRating,
      interiorRating: dto.interiorRating,
      notes: normalizeNotes(dto.notes),
      isValidated: dto.isValidated,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
    return this.repo.save(rating);
  }

  async getById(id: string): Promise<Rating> {
    const rating = await this.repo.findOneBy({ id });
    if (!rating) throw AppError.notFound(`Rating with id "${id}" was not found.`);
    return rating;
  }

  async listByShop(shopId: string, options: ListRatingsOptions): Promise<PaginatedRatings> {
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

    return {
      data: ratings.map((rating) => toRatingResponse(rating)),
      pagination: paginationMeta(page, limit, total),
    };
  }

  async listAdmin(filters: AdminRatingListFilters): Promise<PaginatedRatings> {
    const { page, limit, skip } = parsePagination(filters);
    const qb = this.repo
      .createQueryBuilder('rating')
      .select(RATING_LIST_COLUMNS)
      .leftJoin('rating.shop', 'shop')
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
      return toRatingResponse(rating, shopName);
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

  async update(id: string, dto: UpdateRatingDto, photoUpdate: PhotoUpdate = {}): Promise<Rating> {
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
    return this.repo.save(rating);
  }

  async setValidated(id: string, isValidated: boolean): Promise<Rating> {
    const rating = await this.getById(id);
    rating.isValidated = isValidated;
    return this.repo.save(rating);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
