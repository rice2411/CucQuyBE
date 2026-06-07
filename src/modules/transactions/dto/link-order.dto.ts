import { IsString } from 'class-validator';

export class LinkOrderDto {
  /** Mã đơn để liên kết; chuỗi rỗng = gỡ liên kết. */
  @IsString()
  orderNumber!: string;
}
