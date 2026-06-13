import { IsString, Length } from 'class-validator';

export class Verify2FADto {
  @IsString()
  @Length(6, 8) // TOTP codes are 6 digits; backup codes may be longer
  code: string;
}
