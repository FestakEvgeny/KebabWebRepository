import { Pagination } from './pagination';

export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaults: { limit?: number; maxLimit?: number } = {},
): Pagination {
  const defaultLimit = defaults.limit ?? 20;
  const maxLimit = defaults.maxLimit ?? 100;
  const limit = clampInt(query.limit, defaultLimit, 1, maxLimit);
  const page = clampInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  return { page, limit, skip: (page - 1) * limit };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
