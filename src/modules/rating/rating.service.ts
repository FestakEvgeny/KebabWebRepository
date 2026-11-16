import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Rating } from './rating.entity';
import { CreateRatingRequest } from './dto/create-rating-request.dto';
import { AdminCreateRatingRequest } from './dto/admin-create-rating-request.dto';
import { UpdateRatingRequest } from './dto/update-rating-request.dto';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { ListRatingsOptions } from './list-ratings-options';
import { AdminRatingListFilters } from './admin-rating-list-filters';
import { AdminRatingListItem } from './admin-rating-list-item';
import { RatingStats } from './rating-stats';
import { IRatingRepository, RATING_REPOSITORY } from './rating.repository';
import { ShopGateway } from './shop-gateway';
import { ShopRatingSummary, ShopService } from '../shop';
import { UploadedPhoto } from '../../shared/utils/photo/uploaded-photo';
import { PhotoUpdate } from '../../shared/utils/photo/photo-update';
import { AppError } from '../../shared/utils/error/app-error';
import { toRatingResponse } from './rating.mapper';

function normalizeNotes(notes?: string | null): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class RatingService {
  constructor(
    // Tokens are declared explicitly (instead of relying on reflected
    // paramtypes) so the DI graph survives the esbuild-based dev runner.
    @Inject(RATING_REPOSITORY) private readonly ratingRepository: IRatingRepository,
    // The gateway is the shop module's ShopService; the module pair imports
    // each other via forwardRef because the shop side reads ratings back.
    @Inject(forwardRef(() => ShopService)) private readonly shops: ShopGateway,
  ) {}

  /** Creates a pending rating via the public API (is_validated always false). */
  async createForShop(
    shopId: string,
    dto: CreateRatingRequest,
    photo?: UploadedPhoto,
  ): Promise<Rating> {
    if (!(await this.shops.exists(shopId))) {
      throw AppError.notFound(`Shop with id "${shopId}" was not found.`);
    }

    return this.ratingRepository.add({
      shopId,
      foodQualityRating: dto.foodQualityRating,
      priceFairRating: dto.priceFairRating,
      interiorRating: dto.interiorRating,
      notes: normalizeNotes(dto.notes),
      isValidated: false,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
  }

  async createAsAdmin(dto: AdminCreateRatingRequest, photo?: UploadedPhoto): Promise<Rating> {
    if (!(await this.shops.exists(dto.shopId))) {
      throw AppError.notFound(`Shop with id "${dto.shopId}" was not found.`);
    }

    const saved = await this.ratingRepository.add({
      shopId: dto.shopId,
      foodQualityRating: dto.foodQualityRating,
      priceFairRating: dto.priceFairRating,
      interiorRating: dto.interiorRating,
      notes: normalizeNotes(dto.notes),
      isValidated: dto.isValidated,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
    if (saved.isValidated) await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async getById(id: string): Promise<Rating> {
    const rating = await this.ratingRepository.findById(id);
    if (!rating) throw AppError.notFound(`Rating with id "${id}" was not found.`);
    return rating;
  }

  async listByShop(shopId: string, options: ListRatingsOptions): Promise<PaginatedList<Rating>> {
    return this.ratingRepository.listByShop(shopId, options);
  }

  /** Validated ratings for one shop, newest first, in the shop module's summary shape. */
  async listValidatedSummaries(shopId: string): Promise<ShopRatingSummary[]> {
    const ratings = await this.ratingRepository.listValidatedByShop(shopId);
    return ratings.map((rating) => toRatingResponse(rating));
  }

  async listAdmin(filters: AdminRatingListFilters): Promise<PaginatedList<AdminRatingListItem>> {
    return this.ratingRepository.listAdmin(filters);
  }

  async getPhoto(id: string): Promise<PhotoPayload | null> {
    return this.ratingRepository.findPhotoById(id);
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
    const saved = await this.ratingRepository.save(rating);
    await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async setValidated(id: string, isValidated: boolean): Promise<Rating> {
    const rating = await this.getById(id);
    rating.isValidated = isValidated;
    const saved = await this.ratingRepository.save(rating);
    await this.recomputeAggregate(saved.shopId);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const rating = await this.getById(id);
    await this.ratingRepository.remove(id);
    await this.recomputeAggregate(rating.shopId);
  }

  /**
   * Recomputes the denormalized aggregates for one shop from the shop's
   * validated ratings and pushes them onto the shop row via the gateway.
   * Overall score of one rating = mean of its three subscores.
   */
  private async recomputeAggregate(shopId: string): Promise<void> {
    const aggregate = await this.ratingRepository.aggregateValidatedByShop(shopId);
    await this.shops.applyRatingAggregates(shopId, aggregate.averageRating, aggregate.ratingCount);
  }

  async stats(): Promise<RatingStats> {
    return this.ratingRepository.stats();
  }
}
