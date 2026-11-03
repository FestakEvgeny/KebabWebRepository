import { Request } from 'express';
import { PaginationMeta } from '../../utils/pagination-meta';

export interface PaginationVm {
  page: number;
  totalPages: number;
  total: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

/** Builds prev/next URLs that preserve the current filter query string. */
export function buildPaginationVm(req: Request, meta: PaginationMeta): PaginationVm {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string' && value !== '' && key !== 'page') {
      params.set(key, value);
    }
  }
  const urlFor = (page: number): string => {
    params.set('page', String(page));
    return `${req.path}?${params.toString()}`;
  };
  return {
    page: meta.page,
    totalPages: meta.totalPages,
    total: meta.total,
    prevUrl: meta.page > 1 ? urlFor(meta.page - 1) : null,
    nextUrl: meta.page < meta.totalPages ? urlFor(meta.page + 1) : null,
  };
}
