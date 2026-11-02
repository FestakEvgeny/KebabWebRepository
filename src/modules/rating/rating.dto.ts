import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { booleanTransform } from '../../middleware/validate';

export class CreateRatingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  foodQualityRating!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priceFairRating!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  interiorRating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** Used by the admin panel form, which also picks the shop and moderation flag. */
export class AdminCreateRatingDto extends CreateRatingDto {
  @IsUUID()
  shopId!: string;

  @Transform(booleanTransform)
  @IsBoolean()
  isValidated!: boolean;
}

export class UpdateRatingDto extends CreateRatingDto {
  @Transform(booleanTransform)
  @IsBoolean()
  isValidated!: boolean;
}

export class ListRatingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
