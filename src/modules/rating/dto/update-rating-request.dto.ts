import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { booleanTransform } from '../../../middleware/boolean-transform';
import { CreateRatingRequest } from './create-rating-request.dto';

export class UpdateRatingRequest extends CreateRatingRequest {
  @Transform(booleanTransform)
  @IsBoolean()
  isValidated!: boolean;
}
