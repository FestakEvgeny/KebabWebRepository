import { DataSource } from 'typeorm';
import { env } from '../../config/env';
import { AuthToken } from '../../database/entities/auth-token.entity';
import { AppError } from '../../utils/error/app-error';
import { randomToken } from '../../utils/math/crypto';

/** Random entropy per token; the hex representation is twice as long. */
const ACCESS_TOKEN_BYTES = 32;
const REFRESH_TOKEN_BYTES = 48;

/** 256-bit random tokens will never collide in practice; retries guard the unique constraints. */
const MAX_TOKEN_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

export class OAuthService {
  constructor(private readonly dataSource: DataSource) { }

  private get repository() {
    return this.dataSource.getRepository(AuthToken);
  }

  /** Issues a brand-new token pair (GET /oauth/token). */
  async issueTokens(now = new Date()): Promise<AuthToken> {
    for (let attempt = 1; ; attempt += 1) {
      const record = this.repository.create({
        accessToken: randomToken(ACCESS_TOKEN_BYTES),
        refreshToken: randomToken(REFRESH_TOKEN_BYTES),
        accessTokenExpiresAt: addSeconds(now, env.ACCESS_TOKEN_TTL_SECONDS),
        refreshTokenExpiresAt: addSeconds(now, env.REFRESH_TOKEN_TTL_SECONDS),
      });
      try {
        return await this.repository.save(record);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_TOKEN_ATTEMPTS) throw error;
      }
    }
  }


  async refreshAccessToken(refreshToken: string, now = new Date()): Promise<AuthToken> {
    const record = await this.repository.findOneBy({ refreshToken });
    if (!record) {
      throw new AppError(
        400,
        'INVALID_REFRESH_TOKEN',
        'Refresh token is unknown. Request a new token pair via GET /api/v1/oauth/token.',
      );
    }
    if (record.refreshTokenExpiresAt.getTime() <= now.getTime()) {
      await this.repository.delete({ id: record.id });
      throw new AppError(
        400,
        'REFRESH_TOKEN_EXPIRED',
        'Refresh token has expired and was revoked. Request a new token pair via GET /api/v1/oauth/token.',
      );
    }

    var accessTokenExpiresIs = addSeconds(now, env.ACCESS_TOKEN_TTL_SECONDS)
    if (accessTokenExpiresIs.getTime() > record.refreshTokenExpiresAt.getTime()) {
      accessTokenExpiresIs = record.refreshTokenExpiresAt
    }

    for (let attempt = 1; ; attempt += 1) {
      record.accessToken = randomToken(ACCESS_TOKEN_BYTES);
      record.accessTokenExpiresAt = accessTokenExpiresIs;
      try {
        return await this.repository.save(record);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_TOKEN_ATTEMPTS) throw error;
      }
    }
  }

  /** Resolves an access token for the Bearer auth middleware; null when unknown or expired. */
  async findActiveByAccessToken(accessToken: string, now = new Date()): Promise<AuthToken | null> {
    const record = await this.repository.findOneBy({ accessToken });
    if (!record) return null;
    return record.accessTokenExpiresAt.getTime() > now.getTime() ? record : null;
  }
}

function addSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}
