import { Rating } from '../../database/entities/rating.entity';

export interface AdminRatingListItem {
  rating: Rating;
  shopName?: string;
}
