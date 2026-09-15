import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateVideoDto {
  @IsNotEmpty({ message: 'URL không được để trống' })
  @IsString({ message: 'URL phải là chuỗi ký tự' })
  url: string;
}
