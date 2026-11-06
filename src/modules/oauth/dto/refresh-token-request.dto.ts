import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken!: string;
}
