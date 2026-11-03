import { Shop } from '../../database/entities/shop.entity';
import { Rating } from '../../database/entities/rating.entity';
import { toShopResponse } from '../shop/shop.mapper';
import { toRatingResponse } from '../rating/rating.mapper';
import { MobileShopResponse } from './dto/mobile-shop-response.dto';
import { MobileRatingResponse } from './dto/mobile-rating-response.dto';

export function toMobileShopResponse(shop: Shop): MobileShopResponse {
  const { isValidated: _isValidated, ...rest } = toShopResponse(shop);
  return rest;
}

export function toMobileRatingResponse(rating: Rating): MobileRatingResponse {
  const { isValidated: _isValidated, ...rest } = toRatingResponse(rating);
  return rest;
}
