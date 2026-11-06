import { env } from '../../config/env';
import { AuthToken } from '../../database/entities/auth-token.entity';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds, so clients can refresh proactively. */
  expiresIn: number;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export function toTokenResponse(record: AuthToken): TokenResponse {
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    accessExpiresAt: record.accessTokenExpiresAt,
    refreshExpiresAt: record.refreshTokenExpiresAt,
  };
}
