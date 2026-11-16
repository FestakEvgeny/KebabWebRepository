import { Shop, toShopResponse } from '../shop';
import { Rating, toRatingResponse } from '../rating';

/**
 * Admin view models. Unlike the public API mappers, these expose the
 * moderation flag — the admin panel is the only place that displays and
 * changes it.
 */
export function toAdminShopResponse(shop: Shop) {
  return { ...toShopResponse(shop), isValidated: shop.isValidated };
}

export function toAdminRatingResponse(rating: Rating, shopName?: string) {
  return { ...toRatingResponse(rating, shopName), isValidated: rating.isValidated };
}
