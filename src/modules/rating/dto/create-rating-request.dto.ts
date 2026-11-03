import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRatingRequest {
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
