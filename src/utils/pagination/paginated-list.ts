import { PaginationMeta } from './pagination-meta';

/** Generic paginated service result. Controllers map `data` per client. */
export interface PaginatedList<T> {
  data: T[];
  pagination: PaginationMeta;
}
