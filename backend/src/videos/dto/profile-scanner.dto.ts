import { IsArray, IsOptional, IsString, IsNumber } from 'class-validator';

export class StartScanDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profileUrls?: string[];

  @IsOptional()
  @IsString()
  profileUrl?: string;

  @IsOptional()
  @IsString()
  targetTag?: string;

  @IsOptional()
  @IsNumber()
  maxScrolls?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class SaveCookieDto {
  @IsString()
  content: string;
}

