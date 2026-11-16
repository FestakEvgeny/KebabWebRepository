import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { env } from '../../src/shared/config/env';
import { AuthToken } from '../../src/modules/oauth/auth-token.entity';
import { User } from '../../src/modules/oauth/user.entity';
import { OAuthService } from '../../src/modules/oauth/oauth.service';

function createFakeRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((entity: Partial<AuthToken>) => entity),
    save: vi.fn(async (entity: Partial<AuthToken>) => ({ ...entity, id: entity.id ?? 'auth-1' })),
    findOneBy: vi.fn(),
    delete: vi.fn(async () => ({ affected: 1 })),
    ...overrides,
  };
}

function createFakeDataSource(
  repo: Record<string, unknown>,
  userRepo: Record<string, unknown> = createFakeRepo(),
): DataSource {
  return {
    getRepository: vi.fn((entity: unknown) => (entity === User ? userRepo : repo)),
  } as unknown as DataSource;
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
    const repo = createFakeRepo();
    const service = new OAuthService(createFakeDataSource(repo));

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
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('regenerates tokens when the database reports a unique violation', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    let saveCalls = 0;
    const repo = createFakeRepo({
      save: vi.fn(async (entity: Partial<AuthToken>) => {
        saveCalls += 1;
        if (saveCalls === 1) throw uniqueViolation;
        return { ...entity, id: 'auth-1' };
      }),
    });
    const service = new OAuthService(createFakeDataSource(repo));

    const record = await service.issueTokens(NOW);

    expect(saveCalls).toBe(2);
    expect(record.accessToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refresh rotates the access token but reuses the refresh token untouched', async () => {
    const existing = existingRecord();
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => ({ ...existing })) });
    const service = new OAuthService(createFakeDataSource(repo));

    const record = await service.refreshAccessToken(existing.refreshToken, NOW);

    expect(record.id).toBe(existing.id);
    expect(record.refreshToken).toBe(existing.refreshToken);
    expect(record.refreshTokenExpiresAt).toEqual(existing.refreshTokenExpiresAt);
    expect(record.accessToken).not.toBe(existing.accessToken);
    expect(record.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + env.ACCESS_TOKEN_TTL_SECONDS * 1000),
    );
  });

  it('deletes the record and throws 400 when the refresh token has expired', async () => {
    const existing = existingRecord({
      refreshTokenExpiresAt: new Date(NOW.getTime() - 1000),
    });
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => ({ ...existing })) });
    const service = new OAuthService(createFakeDataSource(repo));

    await expect(service.refreshAccessToken(existing.refreshToken, NOW)).rejects.toMatchObject({
      statusCode: 400,
      code: 'REFRESH_TOKEN_EXPIRED',
    });
    expect(repo.delete).toHaveBeenCalledWith({ id: existing.id });
  });

  it('throws 400 for an unknown refresh token without touching the database', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => null) });
    const service = new OAuthService(createFakeDataSource(repo));

    await expect(service.refreshAccessToken('unknown', NOW)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('findActiveByAccessToken resolves only known, unexpired access tokens', async () => {
    const active = existingRecord({
      accessTokenExpiresAt: new Date(NOW.getTime() + 60_000),
    });
    const expired = existingRecord({
      accessToken: 'b'.repeat(64),
      accessTokenExpiresAt: new Date(NOW.getTime() - 60_000),
    });
    const repo = createFakeRepo({
      findOneBy: vi.fn(async ({ accessToken }: { accessToken: string }) =>
        accessToken === active.accessToken
          ? { ...active }
          : accessToken === expired.accessToken
            ? { ...expired }
            : null,
      ),
    });
    const service = new OAuthService(createFakeDataSource(repo));

    expect(await service.findActiveByAccessToken(active.accessToken, NOW)).toMatchObject({
      id: active.id,
    });
    expect(await service.findActiveByAccessToken(expired.accessToken, NOW)).toBeNull();
    expect(await service.findActiveByAccessToken('missing', NOW)).toBeNull();
  });
});

describe('OAuthService.register', () => {
  it('stores the user with a bcrypt hash and a normalized email, never the plain password', async () => {
    const userRepo = createFakeRepo({
      save: vi.fn(async (entity: Partial<User>) => ({ ...entity, id: 'user-1', createdAt: NOW })),
    });
    const service = new OAuthService(createFakeDataSource(createFakeRepo(), userRepo));

    const user = await service.register('  NewUser@Example.COM ', 'secret-password');

    expect(user.email).toBe('newuser@example.com');
    expect(user.passwordHash).not.toBe('secret-password');
    expect(await bcrypt.compare('secret-password', user.passwordHash)).toBe(true);
    expect(userRepo.findOneBy).toHaveBeenCalledWith({ email: 'newuser@example.com' });
  });

  it('rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED without saving', async () => {
    const userRepo = createFakeRepo({ findOneBy: vi.fn(async () => ({ id: 'user-1' })) });
    const service = new OAuthService(createFakeDataSource(createFakeRepo(), userRepo));

    await expect(service.register('taken@example.com', 'secret-password')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique violation on save to 409', async () => {
    const userRepo = createFakeRepo({
      findOneBy: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }),
    });
    const service = new OAuthService(createFakeDataSource(createFakeRepo(), userRepo));

    await expect(service.register('taken@example.com', 'secret-password')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });
});

describe('OAuthService.login', () => {
  async function serviceWithUser(password: string, stored = password) {
    const userRepo = createFakeRepo({
      findOneBy: vi.fn(async () => ({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash(stored, 12),
      })),
    });
    return {
      service: new OAuthService(createFakeDataSource(createFakeRepo(), userRepo)),
      userRepo,
    };
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
    const { service, userRepo } = await serviceWithUser('secret-password');

    await expect(service.login('user@example.com', 'wrong-password', NOW)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const userRepo = createFakeRepo({ findOneBy: vi.fn(async () => null) });
    const service = new OAuthService(createFakeDataSource(createFakeRepo(), userRepo));

    await expect(service.login('ghost@example.com', 'secret-password', NOW)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('OAuthService.logout', () => {
  it('deletes the record behind the access token', async () => {
    const repo = createFakeRepo();
    const service = new OAuthService(createFakeDataSource(repo));

    expect(await service.logout('a'.repeat(64))).toBe(true);
    expect(repo.delete).toHaveBeenCalledWith({ accessToken: 'a'.repeat(64) });
  });

  it('returns false when the access token is unknown', async () => {
    const repo = createFakeRepo({ delete: vi.fn(async () => ({ affected: 0 })) });
    const service = new OAuthService(createFakeDataSource(repo));

    expect(await service.logout('missing')).toBe(false);
  });
});
