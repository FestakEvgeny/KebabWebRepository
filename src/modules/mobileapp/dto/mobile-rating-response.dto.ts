import { RatingResponse } from '../../rating/dto/rating-response.dto';

/** Rating payload for the mobile app: the moderation flag is never exposed. */
export type MobileRatingResponse = Omit<RatingResponse, 'isValidated'>;
