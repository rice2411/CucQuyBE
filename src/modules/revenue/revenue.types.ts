/**
 * Types báo cáo doanh thu — port nguyên từ FE services/revenueService.ts.
 * Giữ NGUYÊN cấu trúc để số liệu khớp 100% với bản FE.
 */

export interface RevenuePoint {
  label: string;
  revenue: number;
  profit: number;
}

export interface RevenueReport {
  totalRevenue: number;
  orderCount: number;
  totalCommission: number;
  totalStockIn: number;
  totalExpenses: number;
  totalCosts: number;
  profit: number;
  margin: number;
  bankIn: number;
  /** bankIn - totalRevenue (đối chiếu ngân hàng vs doanh thu đơn) */
  bankInDelta: number;
  series: RevenuePoint[];
  costBreakdown: { stockIn: number; commission: number; expenses: number };
}
