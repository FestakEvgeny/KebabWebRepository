import { RatingResponse } from '../../rating/dto/rating-response.dto';

/**
 * Public shop detail (API v1): a shop plus its validated ratings, newest
 * first, as served by GET /api/v1/shops/:id.
 */
export interface ShopDetailResponse {
  id: string;
  name: string;
  geo: { latitude: number; longitude: number };
  rating: number | null;
  countOfRates: number | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  distanceKm?: number;
  ratingsList: RatingResponse[];
}
