import { IsOptional } from 'class-validator';

export class RefreshAllDto {
  @IsOptional()
  concurrency?: string | number;
}
