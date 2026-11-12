import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { emailTransform } from '../../../utils/transform/email-transform';

export class RegisterRequest {
  @Transform(emailTransform)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // bcrypt only hashes the first 72 bytes, so longer passwords would be silently truncated.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
