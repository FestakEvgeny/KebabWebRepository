import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { booleanTransform } from '../../../shared/utils/transform/boolean-transform';
import { CreateShopRequest } from './create-shop-request.dto';

export class UpdateShopRequest extends CreateShopRequest {
  @Transform(booleanTransform)
  @IsBoolean()
  isValidated!: boolean;
}
