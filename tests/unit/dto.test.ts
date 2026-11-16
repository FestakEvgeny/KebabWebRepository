import { describe, expect, it } from 'vitest';
import { CreateShopRequest } from '../../src/modules/shop/dto/create-shop-request.dto';
import { ListShopsQuery } from '../../src/modules/shop/dto/list-shops-query.dto';
import { CreateRatingRequest } from '../../src/modules/rating/dto/create-rating-request.dto';
import { LoginRequest } from '../../src/modules/oauth/dto/login-request.dto';
import { RegisterRequest } from '../../src/modules/oauth/dto/register-request.dto';
import { parseAndValidate } from '../../src/shared/middleware/validate';

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
  it('parses numbers and strings from the query string', async () => {
    const dto = await parseAndValidate(ListShopsQuery, {
      page: '2',
      limit: '50',
      lat: '52.5',
      lng: '13.4',
    });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.lat).toBe(52.5);
  });

  it('strips the moderation flag — validation status is not a public filter', async () => {
    const dto = await parseAndValidate(ListShopsQuery, { isValidated: 'false' });
    expect((dto as unknown as Record<string, unknown>).isValidated).toBeUndefined();
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

describe('RegisterRequest', () => {
  it('accepts valid credentials and normalizes the email', async () => {
    const dto = await parseAndValidate(RegisterRequest, {
      email: '  NewUser@Example.COM ',
      password: 'secret-password',
    });
    expect(dto.email).toBe('newuser@example.com');
    expect(dto.password).toBe('secret-password');
  });

  it('accepts form-urlencoded string fields', async () => {
    const dto = await parseAndValidate(RegisterRequest, {
      email: 'user@example.com',
      password: 'secret-password',
    });
    expect(dto.password).toBe('secret-password');
  });

  it.each([
    ['not-an-email', 'secret-password', 'email'],
    ['', 'secret-password', 'email'],
    ['user@example.com', 'short', 'password'],
    ['user@example.com', '', 'password'],
    ['user@example.com', 'x'.repeat(73), 'password'],
  ])('rejects %j', async (email, password) => {
    await expect(parseAndValidate(RegisterRequest, { email, password })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('LoginRequest', () => {
  it('accepts credentials and normalizes the email', async () => {
    const dto = await parseAndValidate(LoginRequest, {
      email: ' User@Example.com ',
      password: 'anything-at-all',
    });
    expect(dto.email).toBe('user@example.com');
    expect(dto.password).toBe('anything-at-all');
  });

  it('rejects a missing password and a malformed email', async () => {
    await expect(
      parseAndValidate(LoginRequest, { email: 'user@example.com' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      parseAndValidate(LoginRequest, { email: 'nope', password: 'x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
