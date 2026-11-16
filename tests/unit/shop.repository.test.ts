import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ShopListItem } from '../../src/modules/shop/shop-list-item';
import { ShopRepositoryImpl } from '../../src/modules/shop/shop.repository-impl';

function createQueryBuilderFake() {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: vi.fn(async () => 0),
    getMany: vi.fn(async () => []),
    getRawAndEntities: vi.fn(
      async (): Promise<{ raw: unknown[]; entities: unknown[] }> => ({ raw: [], entities: [] }),
    ),
  };
}

function createRepoFake(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    count: vi.fn(async () => 1),
    create: vi.fn((data: Record<string, unknown>) => data),
    save: vi.fn(async (entity: Record<string, unknown>) => entity),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    createQueryBuilder: vi.fn(() => {
      throw new Error('not used in this test');
    }),
    ...overrides,
  };
}

function createRepository(repoFake: Record<string, unknown>): ShopRepositoryImpl {
  return new ShopRepositoryImpl({
    getRepository: vi.fn(() => repoFake),
  } as unknown as DataSource);
}

describe('ShopRepositoryImpl', () => {
  it('exists reports whether the shop row is present', async () => {
    const present = createRepoFake({ count: vi.fn(async () => 1) });
    expect(await createRepository(present).exists('shop-1')).toBe(true);

    const missing = createRepoFake({ count: vi.fn(async () => 0) });
    expect(await createRepository(missing).exists('missing')).toBe(false);
  });

  it('add persists a new row via create and save', async () => {
    const repoFake = createRepoFake();
    const repository = createRepository(repoFake);

    await repository.add({ name: 'Kebab King', latitude: 52.52, longitude: 13.405 });

    expect(repoFake.create).toHaveBeenCalledWith({
      name: 'Kebab King',
      latitude: 52.52,
      longitude: 13.405,
      isValidated: false,
    });
    expect(repoFake.save).toHaveBeenCalledWith({
      name: 'Kebab King',
      latitude: 52.52,
      longitude: 13.405,
      isValidated: false,
    });
  });

  it('findPhotoById returns null when the row or its photo is missing', async () => {
    const repository = createRepository(createRepoFake({ findOne: vi.fn(async () => null) }));
    expect(await repository.findPhotoById('shop-1')).toBeNull();

    const noPhoto = createRepoFake({
      findOne: vi.fn(async () => ({ id: 'shop-1', photo: null, photoMimeType: null })),
    });
    expect(await createRepository(noPhoto).findPhotoById('shop-1')).toBeNull();
  });

  it('findPhotoById loads only the photo columns and falls back to a generic mime type', async () => {
    const findOne = vi.fn(async () => ({
      id: 'shop-1',
      photo: Buffer.from('bytes'),
      photoMimeType: null,
    }));
    const repository = createRepository(createRepoFake({ findOne }));

    const photo = await repository.findPhotoById('shop-1');

    expect(photo).toEqual({ buffer: Buffer.from('bytes'), mimeType: 'application/octet-stream' });
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      select: { id: true, photo: true, photoMimeType: true },
    });
  });

  it('listValidated fetches only validated shops ordered by creation date', async () => {
    const shops = [{ id: 'shop-1' }];
    const getMany = vi.fn(async () => shops);
    const where = vi.fn().mockReturnThis();
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      where,
      orderBy: vi.fn().mockReturnThis(),
      getMany,
    };
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listValidated();

    expect(result).toBe(shops);
    expect(where).toHaveBeenCalledWith('shop.isValidated = :isValidated', { isValidated: true });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('shop.createdAt', 'DESC');
    expect(getMany).toHaveBeenCalledTimes(1);
  });

  it('listFiltered applies validation, search and pagination filters', async () => {
    const shop = { id: 'shop-1', name: 'Kebab King' };
    const queryBuilder = createQueryBuilderFake();
    queryBuilder.getCount.mockResolvedValue(21);
    queryBuilder.getRawAndEntities.mockResolvedValue({ raw: [], entities: [shop] });
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listFiltered({
      page: 2,
      limit: 10,
      isValidated: false,
      search: 'kebab',
    });

    expect(result).toEqual({
      data: [shop],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('shop.isValidated = :isValidated', {
      isValidated: false,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith("shop.name ILIKE :search ESCAPE '\\'", {
      search: '%kebab%',
    });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('shop.createdAt', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(queryBuilder.addSelect).not.toHaveBeenCalled();
  });

  it('listFiltered orders by distance and attaches rounded kilometres for geo searches', async () => {
    const shop = { id: 'shop-1', name: 'Nearby' } as ShopListItem;
    const queryBuilder = createQueryBuilderFake();
    queryBuilder.getCount.mockResolvedValue(1);
    queryBuilder.getRawAndEntities.mockResolvedValue({ raw: [{ distance_km: 12.3456 }], entities: [shop] });
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listFiltered({
      page: 1,
      limit: 10,
      lat: 52.52,
      lng: 13.405,
      radiusKm: 20,
    });

    expect(result.data[0]).toBe(shop);
    expect(shop.distanceKm).toBe(12.35);
    const distanceSql = queryBuilder.addSelect.mock.calls[0][0] as string;
    expect(distanceSql).toContain('acos');
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(distanceSql, 'distance_km');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(`${distanceSql} <= :radiusKm`, {
      radiusKm: 20,
    });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(distanceSql, 'ASC');
  });

  it('applyRatingAggregates updates the denormalized shop aggregates in place', async () => {
    const repoFake = createRepoFake({ query: vi.fn(async () => []) });
    const repository = createRepository(repoFake);

    await repository.applyRatingAggregates('shop-1', '4.33', 3);

    expect(repoFake.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (repoFake.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('UPDATE shop_table');
    expect(params).toEqual(['shop-1', '4.33', 3]);
  });

  it('stats reads total and pending counts from one query', async () => {
    const repoFake = createRepoFake({
      query: vi.fn(async () => [{ total_shops: 7, pending_shops: 2 }]),
    });
    const repository = createRepository(repoFake);

    expect(await repository.stats()).toEqual({ totalShops: 7, pendingShops: 2 });
    const [sql] = (repoFake.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('FROM shop_table');
  });
});
