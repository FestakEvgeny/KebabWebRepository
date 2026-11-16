import { describe, expect, it, vi } from 'vitest';
import { Rating } from '../../src/modules/rating/rating.entity';
import { RatingService } from '../../src/modules/rating/rating.service';
import { IRatingRepository, NewRating } from '../../src/modules/rating/rating.repository';
import { ShopGateway } from '../../src/modules/rating/shop-gateway';
import { toRatingResponse } from '../../src/modules/rating/rating.mapper';
import { CreateRatingRequest } from '../../src/modules/rating/dto/create-rating-request.dto';

const emptyPage = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

function createFakeRepository(overrides: Partial<IRatingRepository> = {}): IRatingRepository {
  return {
    findById: vi.fn(async () => null),
    findPhotoById: vi.fn(async () => null),
    add: vi.fn(async (data: NewRating) => ({ ...data, id: 'rating-1' }) as Rating),
    save: vi.fn(async (rating: Rating) => rating),
    remove: vi.fn(async () => undefined),
    listByShop: vi.fn(async () => emptyPage),
    listValidatedByShop: vi.fn(async () => []),
    listAdmin: vi.fn(async () => emptyPage),
    aggregateValidatedByShop: vi.fn(async () => ({ averageRating: '4.33', ratingCount: 1 })),
    stats: vi.fn(async () => ({ totalRatings: 0, pendingRatings: 0 })),
    ...overrides,
  };
}

function createFakeShopGateway(overrides: Record<string, unknown> = {}): ShopGateway {
  return {
    exists: vi.fn(async () => true),
    applyRatingAggregates: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ShopGateway;
}

const baseRequest: CreateRatingRequest = {
  foodQualityRating: 5,
  priceFairRating: 4,
  interiorRating: 4,
  notes: 'Tasty',
};

describe('RatingService.createForShop', () => {
  it('creates a pending rating when the shop exists', async () => {
    const repo = createFakeRepository();
    const service = new RatingService(repo, createFakeShopGateway());

    const rating = await service.createForShop('shop-1', baseRequest);

    expect(rating.isValidated).toBe(false);
    expect(rating.shopId).toBe('shop-1');
    expect(rating.notes).toBe('Tasty');
    expect(repo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        foodQualityRating: 5,
        isValidated: false,
        notes: 'Tasty',
      }),
    );
  });

  it('throws 404 when the shop does not exist', async () => {
    const repo = createFakeRepository();
    const service = new RatingService(
      repo,
      createFakeShopGateway({ exists: vi.fn(async () => false) }),
    );

    await expect(service.createForShop('missing', baseRequest)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(repo.add).not.toHaveBeenCalled();
  });

  it('pushes recomputed aggregates to the shop gateway after a validated create', async () => {
    const repo = createFakeRepository({
      aggregateValidatedByShop: vi.fn(async () => ({ averageRating: '4.33', ratingCount: 1 })),
    });
    const gateway = createFakeShopGateway();
    const service = new RatingService(repo, gateway);

    await service.createAsAdmin({ ...baseRequest, shopId: 'shop-1', isValidated: true });

    expect(gateway.applyRatingAggregates).toHaveBeenCalledWith('shop-1', '4.33', 1);
  });

  it('skips aggregate recomputation for pending ratings', async () => {
    const repo = createFakeRepository({
      aggregateValidatedByShop: vi.fn(async () => ({ averageRating: '4.33', ratingCount: 1 })),
    });
    const gateway = createFakeShopGateway();
    const service = new RatingService(repo, gateway);

    await service.createAsAdmin({ ...baseRequest, shopId: 'shop-1', isValidated: false });

    expect(gateway.applyRatingAggregates).not.toHaveBeenCalled();
    expect(repo.aggregateValidatedByShop).not.toHaveBeenCalled();
  });

  it('normalises blank notes to null', async () => {
    const repo = createFakeRepository();
    const service = new RatingService(repo, createFakeShopGateway());

    const rating = await service.createForShop('shop-1', { ...baseRequest, notes: '   ' });

    expect(rating.notes).toBeNull();
    expect(repo.add).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
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
    expect('isValidated' in response).toBe(false);
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
