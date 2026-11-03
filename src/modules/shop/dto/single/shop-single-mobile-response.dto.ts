import { ShopResponse } from '../shop-response.dto';
import { ShopRatingMobileResponse } from './shop-rating-mobile-response.dto';

export interface ShopSingleMobileResponse extends ShopResponse {
    ratingsList: ShopRatingMobileResponse[];
}
