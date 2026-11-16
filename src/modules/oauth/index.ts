import { User } from './user.entity';
import { AuthToken } from './auth-token.entity';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { OAuthModule, OAUTH_ROUTER, AUTHENTICATE } from './oauth.module';
import { createAuthenticate } from './oauth.authenticate';

/** Entities owned by the oauth module; assembled into the DataSource by the database layer. */
export const oauthEntities = [User, AuthToken];

export {
  OAuthService,
  OAuthController,
  OAuthModule,
  OAUTH_ROUTER,
  AUTHENTICATE,
  createAuthenticate,
};
