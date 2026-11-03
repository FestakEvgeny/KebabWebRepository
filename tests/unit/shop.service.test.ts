import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Shop } from '../../src/database/entities/shop.entity';
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
    const service = new ShopService(createFakeDataSource(repo));

    const shop = await service.create({ ...baseRequest, name: '  Kebab King  ' });

    expect(shop.isValidated).toBe(false);
    expect(shop.name).toBe('Kebab King');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kebab King', latitude: 52.52, isValidated: false }),
    );
  });

  it('stores photo bytes and mime type when provided', async () => {
    const repo = createFakeRepo();
    const service = new ShopService(createFakeDataSource(repo));
    const buffer = Buffer.from('fake-image-bytes');

    await service.create(baseRequest, { buffer, mimeType: 'image/png', size: buffer.length });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ photo: buffer, photoMimeType: 'image/png' }),
    );
  });

  it('throws a 404 AppError when the shop does not exist', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => null) });
    const service = new ShopService(createFakeDataSource(repo));

    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns null photo payload when the shop has no photo', async () => {
    const repo = createFakeRepo({ findOne: vi.fn(async () => null) });
    const service = new ShopService(createFakeDataSource(repo));

    expect(await service.getPhoto('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('recomputeAggregates runs the parameterised aggregate update', async () => {
    const repo = createFakeRepo();
    const service = new ShopService(createFakeDataSource(repo));

    await service.recomputeAggregates('shop-1');

    expect(repo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (repo.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('UPDATE shop_table');
    expect(sql).toContain('is_validated = TRUE');
    expect(params).toEqual(['shop-1']);
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
    expect(response.isValidated).toBe(true);
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
