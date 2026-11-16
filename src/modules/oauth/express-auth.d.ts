import type { AuthToken } from './auth-token.entity';

declare global {
  namespace Express {
    interface Request {
      /** Set by the Bearer auth middleware on authenticated /api/v1 requests. */
      auth?: AuthToken;
    }
  }
}

export {};
