import { Router } from 'express';
import { apiWriteLimiter } from '../../middleware/rate-limit';
import { OAuthController } from './oauth.controller';

export function createOAuthRouter(oauthController: OAuthController): Router {
  const router = Router();

  router.get('/token', apiWriteLimiter, oauthController.issue);
  router.post('/token', apiWriteLimiter, oauthController.refresh);

  return router;
}
