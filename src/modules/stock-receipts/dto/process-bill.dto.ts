import { IsNotEmpty, IsString } from 'class-validator';

export class ProcessBillDto {
  /** base64 thuần (không có prefix data:image/...). */
  @IsString()
  @IsNotEmpty()
  imageBase64!: string;
}
