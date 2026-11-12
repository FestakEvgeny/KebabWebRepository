import { DataSource } from 'typeorm';
import { RatingService } from '../rating/rating.service';
import { ShopService } from '../shop/shop.service';

export interface AdminRouterDeps {
  dataSource: DataSource;
  shopService: ShopService;
  ratingService: RatingService;
}
