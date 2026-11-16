import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { AuthTokenRepositoryImpl } from '../../src/modules/oauth/auth-token.repository-impl';
import { UserRepositoryImpl } from '../../src/modules/oauth/user.repository-impl';

function createRepoFake(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((data: Record<string, unknown>) => data),
    save: vi.fn(async (entity: Record<string, unknown>) => entity),
    findOneBy: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function dataSourceFake(repoFake: Record<string, unknown>): DataSource {
  return { getRepository: vi.fn(() => repoFake) } as unknown as DataSource;
}

describe('AuthTokenRepositoryImpl', () => {
  it('deleteByAccessToken reports whether a row was removed', async () => {
    const removed = createRepoFake({ delete: vi.fn(async () => ({ affected: 1 })) });
    expect(
      await new AuthTokenRepositoryImpl(dataSourceFake(removed)).deleteByAccessToken('a'.repeat(64)),
    ).toBe(true);

    const missing = createRepoFake({ delete: vi.fn(async () => ({ affected: 0 })) });
    expect(
      await new AuthTokenRepositoryImpl(dataSourceFake(missing)).deleteByAccessToken('missing'),
    ).toBe(false);

    const noMeta = createRepoFake({ delete: vi.fn(async () => ({})) });
    expect(
      await new AuthTokenRepositoryImpl(dataSourceFake(noMeta)).deleteByAccessToken('missing'),
    ).toBe(false);
  });

  it('finds records by access or refresh token', async () => {
    const repoFake = createRepoFake({ findOneBy: vi.fn(async () => ({ id: 'auth-1' })) });
    const repository = new AuthTokenRepositoryImpl(dataSourceFake(repoFake));

    expect(await repository.findByAccessToken('access')).toEqual({ id: 'auth-1' });
    expect(await repository.findByRefreshToken('refresh')).toEqual({ id: 'auth-1' });
    const findOneBy = repoFake.findOneBy as ReturnType<typeof vi.fn>;
    expect(findOneBy).toHaveBeenNthCalledWith(1, { accessToken: 'access' });
    expect(findOneBy).toHaveBeenNthCalledWith(2, { refreshToken: 'refresh' });
  });

  it('add persists a new record via create and save', async () => {
    const repoFake = createRepoFake();
    const repository = new AuthTokenRepositoryImpl(dataSourceFake(repoFake));
    const data = {
      userId: null,
      isAuthorized: false,
      accessToken: 'a'.repeat(64),
      refreshToken: 'r'.repeat(96),
      accessTokenExpiresAt: new Date('2026-01-01T00:00:00Z'),
      refreshTokenExpiresAt: new Date('2026-01-02T00:00:00Z'),
    };

    await repository.add(data);

    expect(repoFake.create).toHaveBeenCalledWith(data);
    expect(repoFake.save).toHaveBeenCalledWith(data);
  });
});

describe('UserRepositoryImpl', () => {
  it('findByEmail looks the user up by the exact email', async () => {
    const repoFake = createRepoFake({ findOneBy: vi.fn(async () => ({ id: 'user-1' })) });
    const repository = new UserRepositoryImpl(dataSourceFake(repoFake));

    expect(await repository.findByEmail('user@example.com')).toEqual({ id: 'user-1' });
    expect(repoFake.findOneBy).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('add persists a new user via create and save', async () => {
    const repoFake = createRepoFake();
    const repository = new UserRepositoryImpl(dataSourceFake(repoFake));
    const data = { email: 'user@example.com', passwordHash: 'hash' };

    await repository.add(data);

    expect(repoFake.create).toHaveBeenCalledWith(data);
    expect(repoFake.save).toHaveBeenCalledWith(data);
  });
});
