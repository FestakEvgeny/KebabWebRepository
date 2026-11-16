import { Rating } from './rating.entity';

export interface AdminRatingListItem {
  rating: Rating;
  shopName?: string;
}
