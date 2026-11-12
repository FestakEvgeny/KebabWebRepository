import { Router } from 'express';
import { createAuthenticate } from '../middleware/authenticate';
import { OAuthController } from '../modules/oauth/oauth.controller';
import { createOAuthRouter } from '../modules/oauth/oauth.routes';
import { RatingController } from '../modules/rating/rating.controller';
import { ShopController } from '../modules/shop/shop.controller';
import { createShopRouter } from '../modules/shop/shop.routes';
import { ApiV1Deps } from './api-v1-deps';

// API: /api/v1/...
export function createApiV1Router({ shopService, ratingService, oauthService }: ApiV1Deps): Router {
  const router = Router();

  const oauthController = new OAuthController(oauthService);
  const shopController = new ShopController(shopService);
  const ratingController = new RatingController(ratingService);

  router.use('/oauth', createOAuthRouter(oauthController));

  // Everything else below /api/v1 requires 'Authorization: Bearer <accessToken>'.
  router.use(createAuthenticate(oauthService));

  router.use('/shops', createShopRouter(shopController, ratingController));
  router.use('/ratings', ratingController.rootRouter);

  return router;
}
