import { Rating } from './rating.entity';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { RatingStats } from './rating-stats';
import { ShopGateway } from './shop-gateway';
import { RatingModule, RATINGS_NESTED_ROUTER, RATINGS_ROOT_ROUTER } from './rating.module';
import { toRatingResponse } from './rating.mapper';

/** Entities owned by the rating module; assembled into the DataSource by the database layer. */
export const ratingEntities = [Rating];

export {
  Rating,
  RatingService,
  RatingController,
  RatingModule,
  RatingStats,
  ShopGateway,
  RATINGS_NESTED_ROUTER,
  RATINGS_ROOT_ROUTER,
  toRatingResponse,
};
export { AdminCreateRatingRequest } from './dto/admin-create-rating-request.dto';
export { UpdateRatingRequest } from './dto/update-rating-request.dto';
