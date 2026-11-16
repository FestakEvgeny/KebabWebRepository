import { Router } from 'express';
import { ApiV1Deps } from './api-v1-deps';

// API: /api/v1/...
export function createApiV1Router({
  authenticate,
  oauthRouter,
  shopsRouter,
  ratingsNestedRouter,
  ratingsRootRouter,
}: ApiV1Deps): Router {
  const router = Router();

  router.use('/oauth', oauthRouter);

  // Everything else below /api/v1 requires 'Authorization: Bearer <accessToken>'.
  router.use(authenticate);

  // Ratings are a sub-resource of shops; the composition layer owns the
  // cross-module mount (shop routes themselves stay rating-free).
  router.use('/shops/:shopId/ratings', ratingsNestedRouter);
  router.use('/shops', shopsRouter);
  router.use('/ratings', ratingsRootRouter);

  return router;
}
