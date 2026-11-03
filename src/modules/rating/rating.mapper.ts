import { Rating } from '../../database/entities/rating.entity';
import { round2 } from '../../utils/math/math';
import { RatingResponse } from './dto/rating-response.dto';

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
