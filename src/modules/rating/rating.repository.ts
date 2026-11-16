import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { Rating } from './rating.entity';
import { ListRatingsOptions } from './list-ratings-options';
import { AdminRatingListFilters } from './admin-rating-list-filters';
import { AdminRatingListItem } from './admin-rating-list-item';
import { RatingStats } from './rating-stats';

/** Data for a new rating row; notes are already normalized by the caller. */
export interface NewRating {
  shopId: string;
  foodQualityRating: number;
  priceFairRating: number;
  interiorRating: number;
  notes: string | null;
  isValidated: boolean;
  photo?: Buffer;
  photoMimeType?: string;
}

/**
 * Aggregates over one shop's validated ratings. The average comes back as a
 * NUMERIC string (node-postgres), or null when no validated ratings exist.
 */
export interface RatingAggregate {
  averageRating: string | null;
  ratingCount: number;
}

/**
 * Port for the rating_table persistence layer. Implemented by
 * RatingRepositoryImpl over the TypeORM repository; consumers inject this
 * interface via the RATING_REPOSITORY token, never the implementation.
 */
export interface IRatingRepository {
  findById(id: string): Promise<Rating | null>;
  findPhotoById(id: string): Promise<PhotoPayload | null>;
  add(data: NewRating): Promise<Rating>;
  save(rating: Rating): Promise<Rating>;
  remove(id: string): Promise<void>;
  /** Paginated ratings of one shop, newest first. */
  listByShop(shopId: string, options: ListRatingsOptions): Promise<PaginatedList<Rating>>;
  /** Validated ratings of one shop, newest first. */
  listValidatedByShop(shopId: string): Promise<Rating[]>;
  /** Admin listing with the shop name joined in, plus pagination metadata. */
  listAdmin(filters: AdminRatingListFilters): Promise<PaginatedList<AdminRatingListItem>>;
  /** Recomputed aggregates over the shop's validated ratings. */
  aggregateValidatedByShop(shopId: string): Promise<RatingAggregate>;
  stats(): Promise<RatingStats>;
}

/** DI token for the rating repository port. */
export const RATING_REPOSITORY = 'RATING_REPOSITORY';
