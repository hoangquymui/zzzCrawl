import { IsString, IsNotEmpty } from 'class-validator';

export class SaveCookieDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
