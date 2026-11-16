import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { env } from '../../src/shared/config/env';
import { AuthToken } from '../../src/modules/oauth/auth-token.entity';
import { User } from '../../src/modules/oauth/user.entity';
import {
  IAuthTokenRepository,
  NewAuthToken,
} from '../../src/modules/oauth/auth-token.repository';
import { IUserRepository, NewUser } from '../../src/modules/oauth/user.repository';
import { OAuthService } from '../../src/modules/oauth/oauth.service';

function createFakeTokenRepository(
  overrides: Partial<IAuthTokenRepository> = {},
): IAuthTokenRepository {
  return {
    findByAccessToken: vi.fn(async () => null),
    findByRefreshToken: vi.fn(async () => null),
    add: vi.fn(async (data: NewAuthToken) => ({ ...data, id: 'auth-1' }) as AuthToken),
    save: vi.fn(async (record: AuthToken) => record),
    deleteById: vi.fn(async () => undefined),
    deleteByAccessToken: vi.fn(async () => true),
    ...overrides,
  };
}

function createFakeUserRepository(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findByEmail: vi.fn(async () => null),
    add: vi.fn(async (data: NewUser) => ({ ...data, id: 'user-1', createdAt: NOW }) as User),
    ...overrides,
  };
}

function createService(
  tokenOverrides: Partial<IAuthTokenRepository> = {},
  userOverrides: Partial<IUserRepository> = {},
) {
  const tokens = createFakeTokenRepository(tokenOverrides);
  const users = createFakeUserRepository(userOverrides);
  return { service: new OAuthService(tokens, users), tokens, users };
}

function existingRecord(overrides: Partial<AuthToken> = {}): AuthToken {
  const now = new Date('2026-11-06T12:00:00.000Z');
  return {
    id: 'auth-1',
    accessToken: 'a'.repeat(64),
    refreshToken: 'r'.repeat(96),
    accessTokenExpiresAt: new Date(now.getTime() - 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    isAuthorized: false,
    userId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AuthToken;
}

const NOW = new Date('2026-11-06T12:00:00.000Z');

describe('OAuthService', () => {
  it('issues a unique token pair with TTL-based expirations', async () => {
    const { service, tokens } = createService();

    const record = await service.issueTokens(NOW);

    expect(record.accessToken).toMatch(/^[0-9a-f]{64}$/);
    expect(record.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(record.accessToken).not.toBe(record.refreshToken);
    expect(record.isAuthorized).toBe(false);
    expect(record.userId).toBeNull();
    expect(record.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + env.ACCESS_TOKEN_TTL_SECONDS * 1000),
    );
    expect(record.refreshTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    );
    expect(tokens.add).toHaveBeenCalledTimes(1);
  });

  it('regenerates tokens when the database reports a unique violation', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    let addCalls = 0;
    const { service } = createService({
      add: vi.fn(async (data: NewAuthToken) => {
        addCalls += 1;
        if (addCalls === 1) throw uniqueViolation;
        return { ...data, id: 'auth-1' } as AuthToken;
      }),
    });

    const record = await service.issueTokens(NOW);

    expect(addCalls).toBe(2);
    expect(record.accessToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refresh rotates the access token but reuses the refresh token untouched', async () => {
    const existing = existingRecord();
    const { service, tokens } = createService({
      findByRefreshToken: vi.fn(async () => ({ ...existing })),
    });

    const record = await service.refreshAccessToken(existing.refreshToken, NOW);

    expect(record.id).toBe(existing.id);
    expect(record.refreshToken).toBe(existing.refreshToken);
    expect(record.refreshTokenExpiresAt).toEqual(existing.refreshTokenExpiresAt);
    expect(record.accessToken).not.toBe(existing.accessToken);
    expect(record.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + env.ACCESS_TOKEN_TTL_SECONDS * 1000),
    );
    expect(tokens.save).toHaveBeenCalledTimes(1);
  });

  it('deletes the record and throws 400 when the refresh token has expired', async () => {
    const existing = existingRecord({
      refreshTokenExpiresAt: new Date(NOW.getTime() - 1000),
    });
    const { service, tokens } = createService({
      findByRefreshToken: vi.fn(async () => ({ ...existing })),
    });

    await expect(service.refreshAccessToken(existing.refreshToken, NOW)).rejects.toMatchObject({
      statusCode: 400,
      code: 'REFRESH_TOKEN_EXPIRED',
    });
    expect(tokens.deleteById).toHaveBeenCalledWith(existing.id);
  });

  it('throws 400 for an unknown refresh token without touching the database', async () => {
    const { service, tokens } = createService({ findByRefreshToken: vi.fn(async () => null) });

    await expect(service.refreshAccessToken('unknown', NOW)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(tokens.deleteById).not.toHaveBeenCalled();
  });

  it('findActiveByAccessToken resolves only known, unexpired access tokens', async () => {
    const active = existingRecord({
      accessTokenExpiresAt: new Date(NOW.getTime() + 60_000),
    });
    const expired = existingRecord({
      accessToken: 'b'.repeat(64),
      accessTokenExpiresAt: new Date(NOW.getTime() - 60_000),
    });
    const { service } = createService({
      findByAccessToken: vi.fn(async (accessToken: string) => {
        if (accessToken === active.accessToken) return { ...active };
        if (accessToken === expired.accessToken) return { ...expired };
        return null;
      }),
    });

    expect(await service.findActiveByAccessToken(active.accessToken, NOW)).toMatchObject({
      id: active.id,
    });
    expect(await service.findActiveByAccessToken(expired.accessToken, NOW)).toBeNull();
    expect(await service.findActiveByAccessToken('missing', NOW)).toBeNull();
  });
});

describe('OAuthService.register', () => {
  it('stores the user with a bcrypt hash and a normalized email, never the plain password', async () => {
    const { service, users } = createService();

    const user = await service.register('  NewUser@Example.COM ', 'secret-password');

    expect(user.email).toBe('newuser@example.com');
    expect(user.passwordHash).not.toBe('secret-password');
    expect(await bcrypt.compare('secret-password', user.passwordHash)).toBe(true);
    expect(users.findByEmail).toHaveBeenCalledWith('newuser@example.com');
    expect(users.add).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED without saving', async () => {
    const { service, users } = createService(
      undefined,
      { findByEmail: vi.fn(async () => ({ id: 'user-1' }) as User) },
    );

    await expect(service.register('taken@example.com', 'secret-password')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
    expect(users.add).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique violation on save to 409', async () => {
    const { service } = createService(
      undefined,
      {
        add: vi.fn(async () => {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        }),
      },
    );

    await expect(service.register('taken@example.com', 'secret-password')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });
});

describe('OAuthService.login', () => {
  async function serviceWithUser(password: string, stored = password) {
    return createService(undefined, {
      findByEmail: vi.fn(async () =>
        Object.assign(new User(), {
          id: 'user-1',
          email: 'user@example.com',
          passwordHash: await bcrypt.hash(stored, 12),
        }),
      ),
    });
  }

  it('issues an authorized token pair bound to the user', async () => {
    const { service } = await serviceWithUser('secret-password');

    const record = await service.login('User@Example.com', 'secret-password', NOW);

    expect(record.isAuthorized).toBe(true);
    expect(record.userId).toBe('user-1');
    expect(record.accessToken).toMatch(/^[0-9a-f]{64}$/);
    expect(record.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(record.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + env.ACCESS_TOKEN_TTL_SECONDS * 1000),
    );
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS and stores nothing', async () => {
    const { service, tokens } = await serviceWithUser('secret-password');

    await expect(service.login('user@example.com', 'wrong-password', NOW)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(tokens.add).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const { service } = createService(undefined, { findByEmail: vi.fn(async () => null) });

    await expect(service.login('ghost@example.com', 'secret-password', NOW)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('OAuthService.logout', () => {
  it('deletes the record behind the access token', async () => {
    const { service, tokens } = createService({
      deleteByAccessToken: vi.fn(async () => true),
    });

    expect(await service.logout('a'.repeat(64))).toBe(true);
    expect(tokens.deleteByAccessToken).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('returns false when the access token is unknown', async () => {
    const { service } = createService({ deleteByAccessToken: vi.fn(async () => false) });

    expect(await service.logout('missing')).toBe(false);
  });
});
