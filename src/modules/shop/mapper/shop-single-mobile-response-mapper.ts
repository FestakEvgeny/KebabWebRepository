
import { Shop } from '../../../database/entities/shop.entity';
import { ShopSingleMobileResponse } from '../dto/single/shop-single-mobile-response.dto';
import { toRatingMobileResponse } from './shop-rating-mobile-response-mapper';

export function toSingleMobileShopResponse(shop: Shop): ShopSingleMobileResponse {
  const hasPhoto = Boolean(shop.photo ?? null) || Boolean(shop.photoMimeType ?? null);
  return {
    id: shop.id,
    name: shop.name,
    geo: { latitude: shop.latitude, longitude: shop.longitude },
    rating: shop.rating === null || shop.rating === undefined ? null : Number(shop.rating),
    countOfRates: shop.countOfRates ?? null,
    hasPhoto: hasPhoto,
    photoUrl: hasPhoto ? `/api/v1/shops/${shop.id}/photo` : null,
    isValidated: shop.isValidated,
    createdAt: shop.createdAt instanceof Date ? shop.createdAt.toISOString() : String(shop.createdAt),
    updatedAt: shop.updatedAt instanceof Date ? shop.updatedAt.toISOString() : String(shop.updatedAt),
    ratingsList: shop.ratings.map(toRatingMobileResponse)
  };
}
