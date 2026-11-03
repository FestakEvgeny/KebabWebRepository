import { IsUUID } from 'class-validator';
import { CreateRatingRequest } from '../../rating/dto/create-rating-request.dto';

/**
 * POST /mobileapp/v1/shop/addRating — the route is not nested under a shop, so
 * the shop id travels in the body. The moderation flag is deliberately absent:
 * submissions from the mobile app are always stored as pending.
 */
export class MobileAddRatingRequest extends CreateRatingRequest {
  @IsUUID()
  shopId!: string;
}
