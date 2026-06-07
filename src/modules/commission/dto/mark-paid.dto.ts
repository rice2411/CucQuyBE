import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class MarkPaidDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];
}
