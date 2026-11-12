import { env } from '../../config/env';
import { AuthToken } from '../../database/entities/auth-token.entity';
import { User } from '../../database/entities/user.entity';
import { RegisteredUserResponse } from './dto/registered-user-response.dto';
import { TokenResponse } from './dto/token-response.dto';

export function toTokenResponse(record: AuthToken): TokenResponse {
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    accessExpiresAt: record.accessTokenExpiresAt,
    refreshExpiresAt: record.refreshTokenExpiresAt,
    isAuthorized: record.isAuthorized,
  };
}

export function toRegisteredUserResponse(user: User): RegisteredUserResponse {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
