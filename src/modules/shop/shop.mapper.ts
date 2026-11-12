import { Shop } from '../../database/entities/shop.entity';
import { toRatingResponse } from '../rating/rating.mapper';
import { ShopDetailResponse } from './dto/shop-detail-response.dto';
import { ShopResponse } from './dto/shop-response.dto';

/**
 * Public shop payload. The moderation flag (isValidated) is deliberately
 * absent — moderation state is internal; only admins see it (admin.mapper).
 * `distanceKm` is included only when the listing was geo-filtered.
 */
export function toShopResponse(shop: Shop, distanceKm?: number): ShopResponse {
  const hasPhoto = Boolean(shop.photo ?? null) || Boolean(shop.photoMimeType ?? null);
  return {
    id: shop.id,
    name: shop.name,
    geo: { latitude: shop.latitude, longitude: shop.longitude },
    rating: shop.rating === null || shop.rating === undefined ? null : Number(shop.rating),
    countOfRates: shop.countOfRates ?? null,
    hasPhoto,
    photoUrl: hasPhoto ? `/api/v1/shops/${shop.id}/photo` : null,
    createdAt:
      shop.createdAt instanceof Date ? shop.createdAt.toISOString() : String(shop.createdAt),
    updatedAt:
      shop.updatedAt instanceof Date ? shop.updatedAt.toISOString() : String(shop.updatedAt),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
  };
}

/**
 * Public shop detail: the shop plus its validated ratings (newest first),
 * as served by GET /api/v1/shops/:id.
 */
export function toShopDetailResponse(shop: Shop): ShopDetailResponse {
  return {
    ...toShopResponse(shop),
    ratingsList: (shop.ratings ?? []).map((rating) => toRatingResponse(rating)),
  };
}
