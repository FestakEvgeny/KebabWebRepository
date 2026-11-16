import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Shop } from '../../src/modules/shop/shop.entity';
import { ShopService } from '../../src/modules/shop/shop.service';
import { toShopResponse } from '../../src/modules/shop/shop.mapper';
import { CreateShopRequest } from '../../src/modules/shop/dto/create-shop-request.dto';

function createFakeRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((entity: Partial<Shop>) => entity),
    save: vi.fn(async (entity: Partial<Shop>) => ({ ...entity, id: entity.id ?? 'shop-1' })),
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

function createFakeDataSource(repo: Record<string, unknown>): DataSource {
  return {
    getRepository: vi.fn(() => repo),
    query: vi.fn(),
  } as unknown as DataSource;
}

const baseRequest: CreateShopRequest = { name: 'Kebab King', latitude: 52.52, longitude: 13.405 };

describe('ShopService', () => {
  it('creates a shop as pending validation with a trimmed name', async () => {
    const repo = createFakeRepo();
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    const shop = await service.create({ ...baseRequest, name: '  Kebab King  ' });

    expect(shop.isValidated).toBe(false);
    expect(shop.name).toBe('Kebab King');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kebab King', latitude: 52.52, isValidated: false }),
    );
  });

  it('stores photo bytes and mime type when provided', async () => {
    const repo = createFakeRepo();
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });
    const buffer = Buffer.from('fake-image-bytes');

    await service.create(baseRequest, { buffer, mimeType: 'image/png', size: buffer.length });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ photo: buffer, photoMimeType: 'image/png' }),
    );
  });

  it('throws a 404 AppError when the shop does not exist', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => null) });
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns null photo payload when the shop has no photo', async () => {
    const repo = createFakeRepo({ findOne: vi.fn(async () => null) });
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    expect(await service.getPhoto('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('applyRatingAggregates stores the aggregates pushed by the rating module', async () => {
    const repo = createFakeRepo();
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    await service.applyRatingAggregates('shop-1', '4.33', 3);

    expect(repo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (repo.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('UPDATE shop_table');
    expect(params).toEqual(['shop-1', '4.33', 3]);
  });

  it('exists reports whether the shop row is present', async () => {
    const repo = createFakeRepo({ count: vi.fn(async () => 1) });
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    expect(await service.exists('shop-1')).toBe(true);

    const missing = createFakeRepo({ count: vi.fn(async () => 0) });
    expect(
      await new ShopService(createFakeDataSource(missing), { listValidatedByShop: vi.fn(async () => []) }).exists('missing'),
    ).toBe(false);
  });

  it('listAll fetches only validated shops in one query without pagination', async () => {
    const shops = [
      {
        id: 'shop-1',
        name: 'Kebab King',
        latitude: 52.52,
        longitude: 13.405,
        rating: '4.33',
        countOfRates: 3,
        photo: null,
        photoMimeType: null,
        isValidated: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    const getMany = vi.fn(async () => shops);
    const where = vi.fn().mockReturnThis();
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      where,
      orderBy: vi.fn().mockReturnThis(),
      getMany,
    };
    const repo = createFakeRepo({ createQueryBuilder: vi.fn(() => queryBuilder) });
    const service = new ShopService(createFakeDataSource(repo), { listValidatedByShop: vi.fn(async () => []) });

    const result = await service.listAll();

    expect(result).toBe(shops);
    expect(where).toHaveBeenCalledWith('shop.isValidated = :isValidated', { isValidated: true });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('shop.createdAt', 'DESC');
    expect(getMany).toHaveBeenCalledTimes(1);
  });
});

describe('toShopResponse', () => {
  it('serialises numeric rating strings and flags photos', () => {
    const shop = {
      id: 'shop-1',
      name: 'Kebab King',
      latitude: 52.52,
      longitude: 13.405,
      rating: '4.50',
      countOfRates: 3,
      photo: Buffer.from('x'),
      photoMimeType: 'image/png',
      isValidated: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Shop;

    const response = toShopResponse(shop);
    expect(response.rating).toBe(4.5);
    expect(response.countOfRates).toBe(3);
    expect(response.hasPhoto).toBe(true);
    expect(response.photoUrl).toBe('/api/v1/shops/shop-1/photo');
    expect(response.geo).toEqual({ latitude: 52.52, longitude: 13.405 });
    expect('isValidated' in response).toBe(false);
  });

  it('handles null aggregates without a photo', () => {
    const shop = {
      id: 'shop-2',
      name: 'Empty',
      latitude: 0,
      longitude: 0,
      rating: null,
      countOfRates: null,
      photo: null,
      photoMimeType: null,
      isValidated: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Shop;

    const response = toShopResponse(shop);
    expect(response.rating).toBeNull();
    expect(response.hasPhoto).toBe(false);
    expect(response.photoUrl).toBeNull();
  });
});
