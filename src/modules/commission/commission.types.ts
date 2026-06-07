/**
 * Types + helpers hoa hồng — port từ FE (types/commissionGroup.ts).
 * Giữ NGUYÊN hành vi để số liệu khớp 100% với bản FE-Firestore.
 */

export type CommissionStatus = 'pending' | 'paid';

export interface CommissionTier {
  minQty: number;
  profitShareRate: number; // 0..1
}

export interface CommissionGroup {
  id: string;
  name: string;
  minMargin: number;
  maxMargin: number;
  tiers: CommissionTier[];
  /** @deprecated dữ liệu cũ */
  profitShareRate?: number;
  fallbackRate: number;
  order: number;
}

export interface OrderItem {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  price: number;
  image?: string;
  // Bổ sung khi tính HH (không lưu Firestore)
  commissionAmount?: number;
  commissionGroupName?: string;
  commissionGroupQty?: number;
  commissionRate?: number;
}

export interface Order {
  id: string;
  orderNumber?: string;
  createdBy?: string;
  items?: OrderItem[];
  total?: number;
  shippingCost?: number;
  status?: string;
  deliveryDate?: string;
  commissionStatus?: CommissionStatus;
  commissionAmount?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
}

export interface CollaboratorCommissionSummary {
  collaboratorUid: string;
  collaboratorName: string;
  orders: Order[];
  totalSales: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

export const ORDER_CANCELLED = 'CANCELLED';
export const ORDER_RETURNED = 'RETURNED';

export const isCancelled = (o: Order): boolean =>
  o.status === ORDER_CANCELLED || o.status === ORDER_RETURNED;

export function findGroupForMargin(
  margin: number,
  groups: CommissionGroup[],
): CommissionGroup | undefined {
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  return (
    sorted.find((g) => margin >= g.minMargin && (margin < g.maxMargin || g.maxMargin >= 1)) ??
    sorted[sorted.length - 1]
  );
}

export function getGroupTiers(group: CommissionGroup): CommissionTier[] {
  if (Array.isArray(group.tiers) && group.tiers.length > 0) {
    return [...group.tiers].sort((a, b) => a.minQty - b.minQty);
  }
  return [{ minQty: 1, profitShareRate: group.profitShareRate ?? 0 }];
}

export function rateForQuantity(group: CommissionGroup, qty: number): number {
  const tiers = getGroupTiers(group);
  if (tiers.length === 0) return 0;
  let rate = tiers[0].profitShareRate;
  for (const t of tiers) {
    if (qty >= t.minQty) rate = t.profitShareRate;
  }
  return rate;
}

export function itemCommissionAtRate(
  price: number,
  costPrice: number | undefined,
  fallbackRate: number,
  profitShareRate: number,
): number {
  if (!price || price <= 0) return 0;
  if (costPrice !== undefined && costPrice >= 0) {
    const profit = price - costPrice;
    if (profit <= 0) return 0;
    return profit * profitShareRate;
  }
  return price * fallbackRate;
}
