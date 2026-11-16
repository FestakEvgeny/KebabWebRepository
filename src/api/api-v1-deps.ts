import { RequestHandler, Router } from 'express';

export interface ApiV1Deps {
  /** Bearer-token gate for everything below /api/v1 except the oauth router. */
  authenticate: RequestHandler;
  oauthRouter: Router;
  shopsRouter: Router;
  ratingsNestedRouter: Router;
  ratingsRootRouter: Router;
}
