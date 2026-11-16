import { Module } from '@nestjs/common';
import { RequestHandler, Router } from 'express';
import { AuthTokenRepositoryImpl } from './auth-token.repository-impl';
import { AUTH_TOKEN_REPOSITORY } from './auth-token.repository';
import { UserRepositoryImpl } from './user.repository-impl';
import { USER_REPOSITORY } from './user.repository';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { createOAuthRouter } from './oauth.routes';
import { createAuthenticate } from './oauth.authenticate';

/** DI token under which the OAuth module's mounted Express router is published. */
export const OAUTH_ROUTER = 'OAUTH_ROUTER';
/** DI token for the bearer-token gate guarding everything else below /api/v1. */
export const AUTHENTICATE = 'AUTHENTICATE';

/** Nest wiring for the OAuth module (token issuing, register/login/logout). */
@Module({
  providers: [
    {
      provide: AUTH_TOKEN_REPOSITORY,
      useClass: AuthTokenRepositoryImpl,
    },
    {
      provide: USER_REPOSITORY,
      useClass: UserRepositoryImpl,
    },
    OAuthService,
    OAuthController,
    {
      provide: OAUTH_ROUTER,
      useFactory: (controller: OAuthController): Router => createOAuthRouter(controller),
      inject: [OAuthController],
    },
    {
      provide: AUTHENTICATE,
      useFactory: (service: OAuthService): RequestHandler => createAuthenticate(service),
      inject: [OAuthService],
    },
  ],
  exports: [OAuthService, OAUTH_ROUTER, AUTHENTICATE],
})
export class OAuthModule {}
