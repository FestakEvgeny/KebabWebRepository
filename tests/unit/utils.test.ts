import { describe, expect, it } from 'vitest';
import { parsePagination } from '../../src/utils/pagination/parse-pagination';
import { safeEqual, randomToken } from '../../src/utils/math/crypto';
import { isAllowedImageMime } from '../../src/middleware/upload';
import { isUuid } from '../../src/utils/string/uuid';

describe('parsePagination', () => {
  it('falls back to defaults for missing input', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('parses numeric strings from query params', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('clamps limit to the maximum', () => {
    expect(parsePagination({ limit: '500' }).limit).toBe(100);
  });

  it('clamps page to a minimum of 1', () => {
    expect(parsePagination({ page: '-5' }).page).toBe(1);
  });

  it('ignores non-numeric garbage', () => {
    expect(parsePagination({ page: 'abc', limit: '' })).toEqual({ page: 1, limit: 20, skip: 0 });
  });
});

describe('safeEqual', () => {
  it('matches identical tokens and rejects different ones', () => {
    const token = randomToken(16);
    expect(safeEqual(token, token)).toBe(true);
    expect(safeEqual(token, randomToken(16))).toBe(false);
    expect(safeEqual('short', 'a-much-longer-token')).toBe(false);
  });
});

describe('isAllowedImageMime', () => {
  it('accepts image mime types only', () => {
    expect(isAllowedImageMime('image/png')).toBe(true);
    expect(isAllowedImageMime('image/jpeg')).toBe(true);
    expect(isAllowedImageMime('text/html')).toBe(false);
    expect(isAllowedImageMime('application/octet-stream')).toBe(false);
  });
});

describe('isUuid', () => {
  it('validates uuid shape', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
