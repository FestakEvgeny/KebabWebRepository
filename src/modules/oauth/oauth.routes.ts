import { Router } from 'express';
import { apiLoginLimiter } from '../../shared/middleware/api-login-limiter';
import { apiWriteLimiter } from '../../shared/middleware/api-write-limiter';
import { OAuthController } from './oauth.controller';

export function createOAuthRouter(oauthController: OAuthController): Router {
  const router = Router();

  router.get('/token', apiWriteLimiter, oauthController.issue);
  router.post('/token', apiWriteLimiter, oauthController.refresh);
  router.post('/register', apiWriteLimiter, oauthController.register);
  router.post('/login', apiLoginLimiter, oauthController.login);
  router.post('/logout', apiWriteLimiter, oauthController.logout);

  return router;
}
