import { ShopService } from '../shop';
import { RatingService } from '../rating';
import { AdminAuthService } from './admin-auth.service';

export interface AdminRouterDeps {
  adminAuth: AdminAuthService;
  shopService: ShopService;
  ratingService: RatingService;
}
