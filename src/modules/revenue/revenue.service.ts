import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { ExpensesService } from '../expenses/expenses.service';
import { TransactionsService } from '../transactions/transactions.service';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { CommissionService } from '../commission/commission.service';
import { RedisService } from '../../redis/redis.service';
import { Expense } from '../expenses/expenses.types';
import { Transaction } from '../transactions/transactions.types';
import { SavedStockReceiptSummary } from '../stock-receipts/stock-receipts.types';
import { RevenuePoint, RevenueReport } from './revenue.types';

/** TTL cache báo cáo doanh thu (giây). */
const REPORT_TTL = 120;

/** Shape tối thiểu của đơn cần cho báo cáo (orders + commissionOrders). */
interface RevenueOrder {
  total?: number;
  status?: string;
  deliveryDate?: string | null;
  commissionAmount?: number;
}

const ORDER_CANCELLED = 'CANCELLED';
const ORDER_RETURNED = 'RETURNED';

/* ───────────────────────── helpers thời gian (port từ FE) ──────────────── */
const periodBounds = (fromISO: string, toISO: string): { from: Date; to: Date } => {
  const from = fromISO ? new Date(fromISO) : new Date(0);
  from.setHours(0, 0, 0, 0);
  const to = toISO ? new Date(toISO) : new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const within = (dateStr: string | undefined | null, from: Date, to: Date): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d >= from && d <= to;
};

/** Đơn được tính doanh thu: không huỷ, không hoàn */
const isRevenueOrder = (o: RevenueOrder): boolean =>
  o.status !== ORDER_CANCELLED && o.status !== ORDER_RETURNED;

const stockDate = (r: SavedStockReceiptSummary): string | undefined =>
  r.receiptDate ?? r.createdAt ?? undefined;

/* ───────────────────────── báo cáo P&L (port từ FE) ────────────────────── */
const buildSeries = (
  fromISO: string,
  toISO: string,
  revOrders: RevenueOrder[],
  commissionOrders: RevenueOrder[],
  stockReceipts: SavedStockReceiptSummary[],
  expenses: Expense[],
): RevenuePoint[] => {
  const { from, to } = periodBounds(fromISO, toISO);
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const bucketDays = diffDays <= 31 ? 1 : diffDays <= 90 ? 7 : 30;
  const count = Math.max(1, Math.ceil(diffDays / bucketDays));
  const idxOf = (d: Date) => Math.floor((d.getTime() - from.getTime()) / (bucketDays * 86_400_000));

  const revenue = new Array(count).fill(0);
  const cost = new Array(count).fill(0);

  const addCost = (dateStr: string | undefined | null, amount: number) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime()) || d < from || d > to) return;
    const i = idxOf(d);
    if (i >= 0 && i < count) cost[i] += amount;
  };

  revOrders.forEach((o) => {
    const d = o.deliveryDate ? new Date(o.deliveryDate) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    const i = idxOf(d);
    if (i >= 0 && i < count) revenue[i] += o.total ?? 0;
  });
  commissionOrders.forEach((o) => {
    if (!isRevenueOrder(o)) return;
    addCost(o.deliveryDate, o.commissionAmount ?? 0);
  });
  stockReceipts.forEach((r) => addCost(stockDate(r), r.totalAmount ?? 0));
  expenses.forEach((e) => addCost(e.date, e.amount ?? 0));

  return Array.from({ length: count }, (_, i) => {
    const bucketStart = new Date(from.getTime() + i * bucketDays * 86_400_000);
    return {
      label: `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`,
      revenue: revenue[i],
      profit: revenue[i] - cost[i],
    };
  });
};

@Injectable()
export class RevenueService {
  constructor(
    private readonly orders: OrdersService,
    private readonly expensesSvc: ExpensesService,
    private readonly transactions: TransactionsService,
    private readonly stockReceipts: StockReceiptsService,
    private readonly commission: CommissionService,
    private readonly redis: RedisService,
  ) {}

  /** Báo cáo doanh thu trong kỳ — tự fetch mọi nguồn & tính (port từ FE computeRevenueReport). */
  async getReport(fromISO: string, toISO: string): Promise<RevenueReport> {
    // Report nặng (gộp 5 collection + tính) → cache TTL ngắn theo kỳ. Dữ liệu
    // đổi sẽ phản ánh chậm nhất sau REPORT_TTL giây (chấp nhận được cho báo cáo).
    const cacheKey = `report:revenue:${fromISO}:${toISO}`;
    const cached = await this.redis.get<RevenueReport>(cacheKey);
    if (cached) return cached;

    const [orders, summaries, stockReceipts, expenses, transactions] = await Promise.all([
      this.orders.fetchOrders(),
      this.commission.getAllSummaries(),
      this.stockReceipts.fetchStockReceiptSummaries(),
      this.expensesSvc.findAll(),
      this.transactions.fetchTransactions(),
    ]);
    const commissionOrders = summaries.flatMap((s) => s.orders);

    const { from, to } = periodBounds(fromISO, toISO);

    const revOrders = (orders as RevenueOrder[]).filter(
      (o) => isRevenueOrder(o) && within(o.deliveryDate, from, to),
    );
    const totalRevenue = revOrders.reduce((s, o) => s + (o.total ?? 0), 0);

    const totalCommission = (commissionOrders as RevenueOrder[])
      .filter((o) => isRevenueOrder(o) && within(o.deliveryDate, from, to))
      .reduce((s, o) => s + (o.commissionAmount ?? 0), 0);

    const totalStockIn = stockReceipts
      .filter((r) => within(stockDate(r), from, to))
      .reduce((s, r) => s + (r.totalAmount ?? 0), 0);

    const totalExpenses = expenses
      .filter((e) => within(e.date, from, to))
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const totalCosts = totalCommission + totalStockIn + totalExpenses;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? profit / totalRevenue : 0;

    const bankIn = transactions
      .filter((tr) => tr.transferType === 'in' && within(tr.transactionDate, from, to))
      .reduce((s, tr) => s + (tr.transferAmount ?? 0), 0);

    const report: RevenueReport = {
      totalRevenue,
      orderCount: revOrders.length,
      totalCommission,
      totalStockIn,
      totalExpenses,
      totalCosts,
      profit,
      margin,
      bankIn,
      bankInDelta: bankIn - totalRevenue,
      series: buildSeries(
        fromISO,
        toISO,
        revOrders,
        commissionOrders as RevenueOrder[],
        stockReceipts,
        expenses,
      ),
      costBreakdown: { stockIn: totalStockIn, commission: totalCommission, expenses: totalExpenses },
    };
    await this.redis.set(cacheKey, report, REPORT_TTL);
    return report;
  }
}
