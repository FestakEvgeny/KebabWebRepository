import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { env } from '../../src/config/env';
import { AuthToken } from '../../src/database/entities/auth-token.entity';
import { OAuthService } from '../../src/modules/oauth/oauth.service';

function createFakeRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((entity: Partial<AuthToken>) => entity),
    save: vi.fn(async (entity: Partial<AuthToken>) => ({ ...entity, id: entity.id ?? 'auth-1' })),
    findOneBy: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function createFakeDataSource(repo: Record<string, unknown>): DataSource {
  return {
    getRepository: vi.fn(() => repo),
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
        accessToken === active.accessToken ? { ...active } : accessToken === expired.accessToken ? { ...expired } : null,
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
