import * as bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import { env } from '../../shared/config/env';
import { AuthToken } from './auth-token.entity';
import { IAuthTokenRepository, AUTH_TOKEN_REPOSITORY } from './auth-token.repository';
import { User } from './user.entity';
import { IUserRepository, USER_REPOSITORY } from './user.repository';
import { AppError } from '../../shared/utils/error/app-error';
import { randomToken } from '../../shared/utils/math/crypto';

/** Random entropy per token; the hex representation is twice as long. */
const ACCESS_TOKEN_BYTES = 32;
const REFRESH_TOKEN_BYTES = 48;

/** bcrypt cost; matches the admin panel seeding. */
const PASSWORD_HASH_ROUNDS = 12;

// Constant hash used to equalise response times when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', PASSWORD_HASH_ROUNDS);

/** 256-bit random tokens will never collide in practice; retries guard the unique constraints. */
const MAX_TOKEN_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class OAuthService {
  // Tokens are declared explicitly (instead of relying on reflected
  // paramtypes) so the DI graph survives the esbuild-based dev runner.
  constructor(
    @Inject(AUTH_TOKEN_REPOSITORY) private readonly tokens: IAuthTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async issueTokens(now = new Date()): Promise<AuthToken> {
    return this.createTokenPair({ userId: null, isAuthorized: false }, now);
  }

  async register(email: string, password: string): Promise<User> {
    const normalized = normalizeEmail(email);
    if (await this.users.findByEmail(normalized)) {
      throw emailAlreadyRegistered(normalized);
    }

    try {
      return await this.users.add({
        email: normalized,
        passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw emailAlreadyRegistered(normalized);
      throw error;
    }
  }

  /** Verifies credentials and issues a token pair bound to the user (POST /oauth/login). */
  async login(email: string, password: string, now = new Date()): Promise<AuthToken> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    // Comparing against a dummy hash keeps the response time flat for unknown emails.
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    return this.createTokenPair({ userId: user.id, isAuthorized: true }, now);
  }

  async logout(accessToken: string): Promise<boolean> {
    return this.tokens.deleteByAccessToken(accessToken);
  }

  async refreshAccessToken(refreshToken: string, now = new Date()): Promise<AuthToken> {
    const record = await this.tokens.findByRefreshToken(refreshToken);
    if (!record) {
      throw new AppError(
        400,
        'INVALID_REFRESH_TOKEN',
        'Refresh token is unknown. Request a new token pair via GET /api/v1/oauth/token.',
      );
    }
    if (record.refreshTokenExpiresAt.getTime() <= now.getTime()) {
      await this.tokens.deleteById(record.id);
      throw new AppError(
        400,
        'REFRESH_TOKEN_EXPIRED',
        'Refresh token has expired and was revoked. Request a new token pair via GET /api/v1/oauth/token.',
      );
    }

    let accessTokenExpiresIs = addSeconds(now, env.ACCESS_TOKEN_TTL_SECONDS);
    if (accessTokenExpiresIs.getTime() > record.refreshTokenExpiresAt.getTime()) {
      accessTokenExpiresIs = record.refreshTokenExpiresAt;
    }

    for (let attempt = 1; ; attempt += 1) {
      record.accessToken = randomToken(ACCESS_TOKEN_BYTES);
      record.accessTokenExpiresAt = accessTokenExpiresIs;
      try {
        return await this.tokens.save(record);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_TOKEN_ATTEMPTS) throw error;
      }
    }
  }

  async findActiveByAccessToken(accessToken: string, now = new Date()): Promise<AuthToken | null> {
    const record = await this.tokens.findByAccessToken(accessToken);
    if (!record) return null;
    return record.accessTokenExpiresAt.getTime() > now.getTime() ? record : null;
  }

  private async createTokenPair(
    owner: Pick<AuthToken, 'userId' | 'isAuthorized'>,
    now: Date,
  ): Promise<AuthToken> {
    for (let attempt = 1; ; attempt += 1) {
      const data = {
        ...owner,
        accessToken: randomToken(ACCESS_TOKEN_BYTES),
        refreshToken: randomToken(REFRESH_TOKEN_BYTES),
        accessTokenExpiresAt: addSeconds(now, env.ACCESS_TOKEN_TTL_SECONDS),
        refreshTokenExpiresAt: addSeconds(now, env.REFRESH_TOKEN_TTL_SECONDS),
      };
      try {
        return await this.tokens.add(data);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_TOKEN_ATTEMPTS) throw error;
      }
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailAlreadyRegistered(email: string): AppError {
  return new AppError(409, 'EMAIL_ALREADY_REGISTERED', `Email ${email} is already registered.`);
}

function addSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}
