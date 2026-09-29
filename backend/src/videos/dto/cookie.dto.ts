import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class SaveCookieDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class ToggleSlotCookieDto {
  @IsBoolean()
  enabled: boolean;
}
