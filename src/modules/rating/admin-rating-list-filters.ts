import { ListRatingsOptions } from './list-ratings-options';

export interface AdminRatingListFilters extends ListRatingsOptions {
  status?: 'all' | 'pending' | 'validated';
  shopId?: string;
  search?: string;
}
