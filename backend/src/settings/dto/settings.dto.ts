import { IsInt, Min } from 'class-validator';

export class UpdateIntervalDto {
  @IsInt({ message: 'Chu kỳ quét phải là số nguyên (phút)' })
  @Min(3, { message: 'Chu kỳ quét video tối thiểu là 3 phút' })
  minutes!: number;
}
