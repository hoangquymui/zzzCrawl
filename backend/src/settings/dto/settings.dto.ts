import { IsInt, Min, IsIn, IsOptional } from 'class-validator';

export class UpdateIntervalDto {
  @IsInt({ message: 'Chu kỳ quét phải là số nguyên (phút)' })
  @Min(3, { message: 'Chu kỳ quét tối thiểu là 3 phút' })
  minutes!: number;
}

export class UpdateConcurrencyDto {
  @IsIn(['custom', 'max'], { message: 'Chế độ luồng quét phải là custom hoặc max' })
  mode!: 'custom' | 'max';

  @IsOptional()
  @IsInt({ message: 'Số lượng luồng phải là số nguyên' })
  @Min(1, { message: 'Số lượng luồng tối thiểu là 1' })
  count?: number;
}

