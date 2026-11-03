import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RatingService } from '../../src/modules/rating/rating.service';
import { toRatingResponse } from '../../src/modules/rating/rating.mapper';
import { CreateRatingRequest } from '../../src/modules/rating/dto/create-rating-request.dto';

function createFakeRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    create: vi.fn((entity: Record<string, unknown>) => entity),
    save: vi.fn(async (entity: Record<string, unknown>) => ({
      ...entity,
      id: entity.id ?? 'rating-1',
    })),
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
  return { getRepository: vi.fn(() => repo), query: vi.fn() } as unknown as DataSource;
}

const baseRequest: CreateRatingRequest = {
  foodQualityRating: 5,
  priceFairRating: 4,
  interiorRating: 4,
  notes: 'Tasty',
};

describe('RatingService.createForShop', () => {
  it('creates a pending rating when the shop exists', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => ({ id: 'shop-1' })) });
    const service = new RatingService(createFakeDataSource(repo));

    const rating = await service.createForShop('shop-1', baseRequest);

    expect(rating.isValidated).toBe(false);
    expect(rating.shopId).toBe('shop-1');
    expect(rating.notes).toBe('Tasty');
  });

  it('throws 404 when the shop does not exist', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => null) });
    const service = new RatingService(createFakeDataSource(repo));

    await expect(service.createForShop('missing', baseRequest)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('normalises blank notes to null', async () => {
    const repo = createFakeRepo({ findOneBy: vi.fn(async () => ({ id: 'shop-1' })) });
    const service = new RatingService(createFakeDataSource(repo));

    const rating = await service.createForShop('shop-1', { ...baseRequest, notes: '   ' });

    expect(rating.notes).toBeNull();
  });
});

describe('toRatingResponse', () => {
  it('computes the overall rating as the mean of the three scores', () => {
    const rating = {
      id: 'rating-1',
      shopId: 'shop-1',
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 4,
      notes: null,
      photo: null,
      photoMimeType: null,
      isValidated: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const response = toRatingResponse(rating as never);
    expect(response.overallRating).toBe(4.33);
    expect(response.hasPhoto).toBe(false);
    expect(response.photoUrl).toBeNull();
    expect(response.isValidated).toBe(false);
  });

  it('includes the shop name when provided', () => {
    const response = toRatingResponse(
      {
        id: 'rating-2',
        shopId: 'shop-1',
        foodQualityRating: 1,
        priceFairRating: 1,
        interiorRating: 2,
        notes: null,
        photo: null,
        photoMimeType: null,
        isValidated: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      } as never,
      'Kebab King',
    );
    expect(response.shopName).toBe('Kebab King');
    expect(response.overallRating).toBe(1.33);
  });
});
