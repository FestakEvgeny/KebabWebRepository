import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Rating } from '../../src/modules/rating/rating.entity';
import { RatingRepositoryImpl } from '../../src/modules/rating/rating.repository-impl';

function createQueryBuilderFake() {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: vi.fn(async () => 0),
    getManyAndCount: vi.fn(async (): Promise<[Rating[], number]> => [[], 0]),
    getRawAndEntities: vi.fn(
      async (): Promise<{ raw: unknown[]; entities: unknown[] }> => ({ raw: [], entities: [] }),
    ),
  };
}

function createRepoFake(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((data: Record<string, unknown>) => data),
    save: vi.fn(async (entity: Record<string, unknown>) => entity),
    find: vi.fn(),
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

function createRepository(repoFake: Record<string, unknown>): RatingRepositoryImpl {
  return new RatingRepositoryImpl({
    getRepository: vi.fn(() => repoFake),
  } as unknown as DataSource);
}

describe('RatingRepositoryImpl', () => {
  it('add persists a new row via create and save', async () => {
    const repoFake = createRepoFake();
    const repository = createRepository(repoFake);

    await repository.add({
      shopId: 'shop-1',
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 4,
      notes: 'Tasty',
      isValidated: false,
    });

    expect(repoFake.create).toHaveBeenCalledWith({
      shopId: 'shop-1',
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 4,
      notes: 'Tasty',
      isValidated: false,
    });
    expect(repoFake.save).toHaveBeenCalledTimes(1);
  });

  it('listByShop filters by shop and returns pagination metadata', async () => {
    const ratings = [{ id: 'rating-1' }, { id: 'rating-2' }] as Rating[];
    const queryBuilder = createQueryBuilderFake();
    queryBuilder.getManyAndCount.mockResolvedValue([ratings, 21]);
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listByShop('shop-1', { page: 2, limit: 10 });

    expect(result).toEqual({
      data: ratings,
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(queryBuilder.where).toHaveBeenCalledWith('rating.shopId = :shopId', {
      shopId: 'shop-1',
    });
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('rating.createdAt', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('listByShop applies the validation filter when provided', async () => {
    const queryBuilder = createQueryBuilderFake();
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    await repository.listByShop('shop-1', { isValidated: true });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rating.isValidated = :isValidated', {
      isValidated: true,
    });
  });

  it('listAdmin joins the shop name onto each item via a raw select', async () => {
    const rating = { id: 'rating-1' } as Rating;
    const queryBuilder = createQueryBuilderFake();
    queryBuilder.getCount.mockResolvedValue(1);
    queryBuilder.getRawAndEntities.mockResolvedValue({
      raw: [{ shop_name: 'Kebab King' }],
      entities: [rating],
    });
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listAdmin({ status: 'validated' });

    expect(result).toEqual({
      data: [{ rating, shopName: 'Kebab King' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
      'shop_table',
      'shop',
      'shop.id = rating.shopId',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rating.isValidated = :isValidated', {
      isValidated: true,
    });
  });

  it('listAdmin maps a missing shop name to undefined', async () => {
    const rating = { id: 'rating-1' } as Rating;
    const queryBuilder = createQueryBuilderFake();
    queryBuilder.getRawAndEntities.mockResolvedValue({
      raw: [{}],
      entities: [rating],
    });
    const repository = createRepository(
      createRepoFake({ createQueryBuilder: vi.fn(() => queryBuilder) }),
    );

    const result = await repository.listAdmin({});

    expect(result.data[0]).toEqual({ rating, shopName: undefined });
  });

  it('aggregateValidatedByShop returns the average and count of validated ratings', async () => {
    const repoFake = createRepoFake({
      query: vi.fn(async () => [{ avg_rating: '4.33', rating_count: 2 }]),
    });
    const repository = createRepository(repoFake);

    const aggregate = await repository.aggregateValidatedByShop('shop-1');

    expect(aggregate).toEqual({ averageRating: '4.33', ratingCount: 2 });
    const [sql, params] = (repoFake.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('FROM rating_table');
    expect(sql).toContain('is_validated = TRUE');
    expect(params).toEqual(['shop-1']);
  });

  it('aggregateValidatedByShop maps a missing average to null', async () => {
    const repoFake = createRepoFake({
      query: vi.fn(async () => [{ avg_rating: null, rating_count: 0 }]),
    });
    const repository = createRepository(repoFake);

    expect(await repository.aggregateValidatedByShop('shop-1')).toEqual({
      averageRating: null,
      ratingCount: 0,
    });
  });

  it('stats reads total and pending counts from one query', async () => {
    const repoFake = createRepoFake({
      query: vi.fn(async () => [{ total_ratings: 9, pending_ratings: 3 }]),
    });
    const repository = createRepository(repoFake);

    expect(await repository.stats()).toEqual({ totalRatings: 9, pendingRatings: 3 });
  });

  it('listValidatedByShop finds only validated ratings of the shop, newest first', async () => {
    const ratings = [{ id: 'rating-1' }];
    const find = vi.fn(async () => ratings);
    const repository = createRepository(createRepoFake({ find }));

    const result = await repository.listValidatedByShop('shop-1');

    expect(result).toBe(ratings);
    expect(find).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', isValidated: true },
      order: { createdAt: 'DESC' },
    });
  });
});
