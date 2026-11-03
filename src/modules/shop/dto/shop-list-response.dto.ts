import { PaginationMeta } from '../../../utils/pagination-meta';
import { ShopResponse } from './shop-response.dto';

export interface ShopListResponse {
  data: ShopResponse[];
  pagination: PaginationMeta;
}
