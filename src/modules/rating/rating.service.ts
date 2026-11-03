import { DataSource, Repository } from 'typeorm';
import { Rating } from '../../database/entities/rating.entity';
import { Shop } from '../../database/entities/shop.entity';
import { CreateRatingRequest } from './dto/create-rating-request.dto';
import { AdminCreateRatingRequest } from './dto/admin-create-rating-request.dto';
import { UpdateRatingRequest } from './dto/update-rating-request.dto';
import { RatingListResponse } from './dto/rating-list-response.dto';
import { ListRatingsOptions } from './list-ratings-options';
import { AdminRatingListFilters } from './admin-rating-list-filters';
import { toRatingResponse } from './rating.mapper';
import { UploadedPhoto } from '../../utils/uploaded-photo';
import { PhotoUpdate } from '../../utils/photo-update';
import { AppError } from '../../utils/app-error';
import { parsePagination } from '../../utils/parse-pagination';
import { paginationMeta } from '../../utils/pagination-meta';
import { escapeLike } from '../../utils/escape-like';

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

export class RatingService {
  private readonly repo: Repository<Rating>;
  private readonly shopRepo: Repository<Shop>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(Rating);
    this.shopRepo = ds.getRepository(Shop);
  }

  /** Creates a pending rating via the public API (is_validated always false). */
  async createForShop(shopId: string, dto: CreateRatingRequest, photo?: UploadedPhoto): Promise<Rating> {
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

  async createAsAdmin(dto: AdminCreateRatingRequest, photo?: UploadedPhoto): Promise<Rating> {
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

  async listByShop(shopId: string, options: ListRatingsOptions): Promise<RatingListResponse> {
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

  async listAdmin(filters: AdminRatingListFilters): Promise<RatingListResponse> {
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

  async update(id: string, dto: UpdateRatingRequest, photoUpdate: PhotoUpdate = {}): Promise<Rating> {
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
