import { IsBoolean } from 'class-validator';

export class MarkExternalDto {
  @IsBoolean()
  isExternal!: boolean;
}
