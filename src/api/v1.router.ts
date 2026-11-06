import { Router } from 'express';
import { ShopService } from '../modules/shop/shop.service';
import { ShopController } from '../modules/shop/shop.controller';
import { createShopRouter } from '../modules/shop/shop.routes';
import { RatingService } from '../modules/rating/rating.service';
import { RatingController } from '../modules/rating/rating.controller';
import { OAuthService } from '../modules/oauth/oauth.service';
import { OAuthController } from '../modules/oauth/oauth.controller';
import { createOAuthRouter } from '../modules/oauth/oauth.routes';
import { createAuthenticate } from '../middleware/authenticate';

export interface ApiV1Deps {
  shopService: ShopService;
  ratingService: RatingService;
  oauthService: OAuthService;
}

// API: /api/v1/...
export function createApiV1Router({ shopService, ratingService, oauthService }: ApiV1Deps): Router {
  const router = Router();

  const oauthController = new OAuthController(oauthService);
  const shopController = new ShopController(shopService);
  const ratingController = new RatingController(ratingService);

  // Token endpoints are the only /api/v1 routes reachable without a Bearer token.
  router.use('/oauth', createOAuthRouter(oauthController));

  // Everything else below /api/v1 requires 'Authorization: Bearer <accessToken>'.
  router.use(createAuthenticate(oauthService));

  router.use('/shops', createShopRouter(shopController, ratingController));
  router.use('/ratings', ratingController.rootRouter);

  return router;
}
