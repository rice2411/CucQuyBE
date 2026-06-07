import { IsString, IsNotEmpty } from 'class-validator';

export class VisionOcrDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
