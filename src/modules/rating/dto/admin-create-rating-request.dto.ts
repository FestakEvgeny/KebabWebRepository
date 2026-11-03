import { Transform } from 'class-transformer';
import { IsBoolean, IsUUID } from 'class-validator';
import { booleanTransform } from '../../../middleware/boolean-transform';
import { CreateRatingRequest } from './create-rating-request.dto';

/** Used by the admin panel form, which also picks the shop and moderation flag. */
export class AdminCreateRatingRequest extends CreateRatingRequest {
  @IsUUID()
  shopId!: string;

  @Transform(booleanTransform)
  @IsBoolean()
  isValidated!: boolean;
}
