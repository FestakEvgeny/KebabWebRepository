import { OAuthService } from '../modules/oauth/oauth.service';
import { RatingService } from '../modules/rating/rating.service';
import { ShopService } from '../modules/shop/shop.service';

export interface ApiV1Deps {
  shopService: ShopService;
  ratingService: RatingService;
  oauthService: OAuthService;
}
