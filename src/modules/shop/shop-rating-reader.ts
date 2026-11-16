/**
 * Public rating payload as embedded in shop detail responses. The shop module
 * owns this shape; the rating module produces it via its public API, so the
 * shop module never imports rating code directly.
 */
export interface ShopRatingSummary {
  id: string;
  shopId: string;
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

/**
 * Port through which the shop module reads the validated ratings it embeds
 * in its detail response. Implemented by the rating module and wired through
 * the DI container (see RatingModule's SHOP_RATINGS_READER provider).
 */
export interface ShopRatingsReader {
  listValidatedByShop(shopId: string): Promise<ShopRatingSummary[]>;
}

/** DI token for the ratings-reader port (implemented by the rating module). */
export const SHOP_RATINGS_READER = 'SHOP_RATINGS_READER';
