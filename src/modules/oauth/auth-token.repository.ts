import { AuthToken } from './auth-token.entity';

/** Data for a freshly issued token pair row. */
export interface NewAuthToken {
  userId: string | null;
  isAuthorized: boolean;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Port for the auth_table persistence layer. Implemented by
 * AuthTokenRepositoryImpl over the TypeORM repository; consumers inject this
 * interface via the AUTH_TOKEN_REPOSITORY token, never the implementation.
 */
export interface IAuthTokenRepository {
  findByAccessToken(accessToken: string): Promise<AuthToken | null>;
  findByRefreshToken(refreshToken: string): Promise<AuthToken | null>;
  add(data: NewAuthToken): Promise<AuthToken>;
  save(record: AuthToken): Promise<AuthToken>;
  deleteById(id: string): Promise<void>;
  /** Deletes the record behind an access token; true when a row was removed. */
  deleteByAccessToken(accessToken: string): Promise<boolean>;
}

/** DI token for the auth-token repository port. */
export const AUTH_TOKEN_REPOSITORY = 'AUTH_TOKEN_REPOSITORY';
