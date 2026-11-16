import { Rating } from './rating.entity';
import { round2 } from '../../shared/utils/math/math';
import { RatingResponse } from './dto/rating-response.dto';

/**
 * Public rating payload. The moderation flag (isValidated) is deliberately
 * absent — moderation state is internal; only admins see it (admin.mapper).
 */
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
    createdAt:
      rating.createdAt instanceof Date ? rating.createdAt.toISOString() : String(rating.createdAt),
    updatedAt:
      rating.updatedAt instanceof Date ? rating.updatedAt.toISOString() : String(rating.updatedAt),
  };
}
