import { IsArray, IsOptional, IsString } from 'class-validator';
import { CustomerBadgeRule, OrderBadge, ProductBadge } from '../badges.types';

/**
 * Body cho PUT /badges. Service sẽ type-guard từng phần tử nên ở đây chỉ
 * cần kiểm tra cấu trúc top-level (mảng + updatedBy optional).
 */
export class SaveBadgesDto {
  @IsArray()
  orderBadges!: OrderBadge[];

  @IsArray()
  productBadges!: ProductBadge[];

  @IsArray()
  customerRules!: CustomerBadgeRule[];

  @IsOptional()
  @IsString()
  updatedBy?: string | null;
}
