import { PaginationMeta } from '../../../utils/pagination/pagination-meta';
import { RatingResponse } from './rating-response.dto';

export interface RatingListResponse {
  data: RatingResponse[];
  pagination: PaginationMeta;
}
