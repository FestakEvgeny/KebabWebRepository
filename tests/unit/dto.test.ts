import { describe, expect, it } from 'vitest';
import { CreateShopRequest } from '../../src/modules/shop/dto/create-shop-request.dto';
import { ListShopsQuery } from '../../src/modules/shop/dto/list-shops-query.dto';
import { CreateRatingRequest } from '../../src/modules/rating/dto/create-rating-request.dto';
import { parseAndValidate } from '../../src/middleware/validate';

describe('CreateShopRequest', () => {
  it('accepts a valid JSON body', async () => {
    const dto = await parseAndValidate(CreateShopRequest, {
      name: 'Kebab King',
      latitude: 52.52,
      longitude: 13.405,
    });
    expect(dto.name).toBe('Kebab King');
    expect(dto.latitude).toBe(52.52);
  });

  it('coerces multipart string fields to numbers', async () => {
    const dto = await parseAndValidate(CreateShopRequest, {
      name: 'Kebab King',
      latitude: '52.52',
      longitude: '13.405',
    });
    expect(dto.latitude).toBe(52.52);
    expect(dto.longitude).toBe(13.405);
  });

  it('rejects out-of-range latitude', async () => {
    await expect(
      parseAndValidate(CreateShopRequest, { name: 'X', latitude: 999, longitude: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('rejects a missing name', async () => {
    await expect(
      parseAndValidate(CreateShopRequest, { latitude: 1, longitude: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('ListShopsQuery', () => {
  it('parses booleans, numbers and clamps-free raw values from the query string', async () => {
    const dto = await parseAndValidate(ListShopsQuery, {
      page: '2',
      limit: '50',
      isValidated: 'true',
      lat: '52.5',
      lng: '13.4',
    });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.isValidated).toBe(true);
    expect(dto.lat).toBe(52.5);
  });

  it('rejects garbage boolean values', async () => {
    await expect(
      parseAndValidate(ListShopsQuery, { isValidated: 'yes' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('CreateRatingRequest', () => {
  it('accepts valid scores', async () => {
    const dto = await parseAndValidate(CreateRatingRequest, {
      foodQualityRating: 5,
      priceFairRating: '4',
      interiorRating: 3,
      notes: 'Great!',
    });
    expect(dto.priceFairRating).toBe(4);
    expect(dto.notes).toBe('Great!');
  });

  it('rejects a score of 6 and a score of 0', async () => {
    await expect(
      parseAndValidate(CreateRatingRequest, {
        foodQualityRating: 6,
        priceFairRating: 4,
        interiorRating: 4,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      parseAndValidate(CreateRatingRequest, {
        foodQualityRating: 0,
        priceFairRating: 4,
        interiorRating: 4,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects non-integer scores', async () => {
    await expect(
      parseAndValidate(CreateRatingRequest, {
        foodQualityRating: 4.5,
        priceFairRating: 4,
        interiorRating: 4,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
