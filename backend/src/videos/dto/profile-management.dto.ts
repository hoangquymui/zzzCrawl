import { IsArray, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CrawlProfilesDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  profileUrls: string[];
}

export class DeleteProfileDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}
