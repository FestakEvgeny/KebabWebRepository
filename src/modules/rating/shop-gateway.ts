/**
 * Port through which the rating module talks to the shop module. Implemented
 * by the shop module's ShopService (injected via forwardRef, see
 * RatingService), keeping the dependency one-way: rating -> shop.
 */
export interface ShopGateway {
  exists(id: string): Promise<boolean>;
  applyRatingAggregates(
    shopId: string,
    rating: string | null,
    countOfRates: number,
  ): Promise<void>;
}
