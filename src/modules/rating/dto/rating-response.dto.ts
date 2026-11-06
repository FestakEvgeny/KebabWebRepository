/**
 * Public rating payload (API v1). The moderation flag is internal: the public
 * API never exposes `isValidated` — only the admin panel sees it. `shopName`
 * is only present on admin listings.
 */
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
  createdAt: string;
  updatedAt: string;
}
