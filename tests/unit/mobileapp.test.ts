import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Shop } from '../../src/database/entities/shop.entity';
import { Rating } from '../../src/database/entities/rating.entity';
import { ShopService } from '../../src/modules/shop/shop.service';
import {
  toMobileRatingResponse,
  toMobileShopResponse,
} from '../../src/modules/mobileapp/mobileapp.routes';
import { MobileAddRatingDto } from '../../src/modules/mobileapp/mobileapp.dto';
import { parseAndValidate } from '../../src/middleware/validate';

function createFakeDataSource(repo: Record<string, unknown>): DataSource {
  return { getRepository: vi.fn(() => repo) } as unknown as DataSource;
}

function buildShop(overrides: Partial<Shop> = {}): Shop {
  return {
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
    ...overrides,
  } as Shop;
}

describe('mobile shop response mapper', () => {
  it('hides isValidated but keeps the rest of the shop payload', () => {
    const response = toMobileShopResponse(buildShop());

    expect('isValidated' in response).toBe(false);
    expect(response).toMatchObject({
      id: 'shop-1',
      name: 'Kebab King',
      geo: { latitude: 52.52, longitude: 13.405 },
      rating: 4.33,
      countOfRates: 3,
    });
  });
});

describe('mobile rating response mapper', () => {
  it('hides isValidated but keeps the rest of the rating payload', () => {
    const rating = {
      id: 'rating-1',
      shopId: 'shop-1',
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 3,
      notes: null,
      photo: null,
      photoMimeType: null,
      isValidated: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as Rating;

    const response = toMobileRatingResponse(rating);

    expect('isValidated' in response).toBe(false);
    expect(response).toMatchObject({
      id: 'rating-1',
      shopId: 'shop-1',
      overallRating: 4,
    });
  });
});

describe('ShopService.listAll', () => {
  it('fetches every shop in one query without pagination', async () => {
    const shops = [buildShop()];
    const getMany = vi.fn(async () => shops);
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getMany,
    };
    const repo = { createQueryBuilder: vi.fn(() => queryBuilder) };
    const service = new ShopService(createFakeDataSource(repo));

    const result = await service.listAll();

    expect(result).toBe(shops);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('shop.createdAt', 'DESC');
    expect(getMany).toHaveBeenCalledTimes(1);
  });
});

describe('MobileAddRatingDto', () => {
  // class-validator's @IsUUID() only accepts version 1-5 UUIDs.
  const MOBILE_SHOP_ID = '00000000-0000-4000-8000-000000000001';

  it('accepts a valid body with a shop id', async () => {
    const dto = await parseAndValidate(MobileAddRatingDto, {
      shopId: MOBILE_SHOP_ID,
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 3,
    });
    expect(dto.shopId).toBe(MOBILE_SHOP_ID);
  });

  it('rejects a missing or malformed shop id', async () => {
    await expect(
      parseAndValidate(MobileAddRatingDto, { foodQualityRating: 5, priceFairRating: 4, interiorRating: 3 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    await expect(
      parseAndValidate(MobileAddRatingDto, {
        shopId: 'not-a-uuid',
        foodQualityRating: 5,
        priceFairRating: 4,
        interiorRating: 3,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('strips a client-supplied isValidated instead of accepting it', async () => {
    const dto = await parseAndValidate(MobileAddRatingDto, {
      shopId: MOBILE_SHOP_ID,
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 3,
      isValidated: true,
    });
    expect((dto as unknown as Record<string, unknown>).isValidated).toBeUndefined();
  });
});
