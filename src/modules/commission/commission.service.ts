import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import {
  CollaboratorCommissionSummary,
  CommissionGroup,
  CommissionTier,
  Order,
  Product,
  findGroupForMargin,
  isCancelled,
  itemCommissionAtRate,
  rateForQuantity,
} from './commission.types';

interface ItemCommissionInfo {
  amount: number;
  groupName: string;
  groupQty: number;
  rate: number;
}
const ZERO_ITEM: ItemCommissionInfo = { amount: 0, groupName: '', groupQty: 0, rate: 0 };

const monthKeyOf = (dateStr?: string): string => {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const groupOfProduct = (
  product: Product | undefined,
  groups: CommissionGroup[],
): CommissionGroup | undefined => {
  if (!product || groups.length === 0) return undefined;
  if (product.costPrice !== undefined && product.costPrice >= 0) {
    const profit = product.price - product.costPrice;
    if (profit <= 0) return undefined;
    return findGroupForMargin(profit / product.price, groups);
  }
  return [...groups].sort((a, b) => a.order - b.order)[0];
};

@Injectable()
export class CommissionService {
  constructor(private readonly fs: FirestoreService) {}

  // ── Đọc dữ liệu (type-guard) ──────────────────────────────
  private async fetchGroups(): Promise<CommissionGroup[]> {
    const snap = await this.fs.collection('commissionGroups').orderBy('order', 'asc').get();
    return snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;
      const tiers = Array.isArray(r.tiers)
        ? (r.tiers as any[]).map((t) => ({
            minQty: typeof t?.minQty === 'number' ? t.minQty : 1,
            profitShareRate: typeof t?.profitShareRate === 'number' ? t.profitShareRate : 0,
          }))
        : [];
      return {
        id: d.id,
        name: typeof r.name === 'string' ? r.name : '',
        minMargin: typeof r.minMargin === 'number' ? r.minMargin : 0,
        maxMargin: typeof r.maxMargin === 'number' ? r.maxMargin : 1,
        tiers: tiers as CommissionTier[],
        profitShareRate: typeof r.profitShareRate === 'number' ? r.profitShareRate : undefined,
        fallbackRate: typeof r.fallbackRate === 'number' ? r.fallbackRate : 0,
        order: typeof r.order === 'number' ? r.order : 0,
      };
    });
  }

  private async fetchProducts(): Promise<Product[]> {
    const snap = await this.fs.collection('products').get();
    return snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: typeof r.name === 'string' ? r.name : '',
        price: typeof r.price === 'number' ? r.price : 0,
        costPrice: typeof r.costPrice === 'number' ? r.costPrice : undefined,
      };
    });
  }

  private async fetchCollaborators(): Promise<{ uid: string; name: string }[]> {
    const snap = await this.fs.collection('users').get();
    return snap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as Record<string, unknown>) }))
      .filter((u) => String((u as any).role ?? '').toLowerCase() === 'colaborator')
      .map((u: any) => ({
        uid: u.uid,
        name: u.customName || u.displayName || u.email || u.uid,
      }));
  }

  private mapOrder(id: string, r: Record<string, unknown>): Order {
    const itemsRaw = Array.isArray(r.items) ? (r.items as any[]) : [];
    return {
      id,
      orderNumber: typeof r.orderNumber === 'string' ? r.orderNumber : undefined,
      createdBy: typeof r.createdBy === 'string' ? r.createdBy : undefined,
      items: itemsRaw.map((it) => ({
        id: typeof it?.id === 'string' ? it.id : '',
        productId: typeof it?.productId === 'string' ? it.productId : undefined,
        name: typeof it?.name === 'string' ? it.name : '',
        quantity: typeof it?.quantity === 'number' ? it.quantity : 1,
        price: typeof it?.price === 'number' ? it.price : 0,
        image: typeof it?.image === 'string' ? it.image : '',
      })),
      total: typeof r.total === 'number' ? r.total : 0,
      shippingCost: typeof r.shippingCost === 'number' ? r.shippingCost : 0,
      status: typeof r.status === 'string' ? r.status : undefined,
      deliveryDate: typeof r.deliveryDate === 'string' ? r.deliveryDate : undefined,
      commissionStatus: r.commissionStatus === 'paid' ? 'paid' : 'pending',
    };
  }

  // ── Tính HH theo tháng/nhóm (per-item) ─────────────────────
  private computeByMonth(
    orders: Order[],
    groups: CommissionGroup[],
    products: Product[],
  ): Map<string, ItemCommissionInfo[]> {
    const productById = new Map(products.map((p) => [p.id, p]));
    const result = new Map<string, ItemCommissionInfo[]>();

    const byMonth = new Map<string, Order[]>();
    for (const o of orders) {
      const m = monthKeyOf(o.deliveryDate);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(o);
    }

    for (const monthOrders of byMonth.values()) {
      const qtyByGroup = new Map<string, number>();
      for (const o of monthOrders) {
        if (isCancelled(o)) continue;
        for (const item of o.items ?? []) {
          const product = productById.get(item.id ?? item.productId ?? '');
          const group = groupOfProduct(product, groups);
          if (!group) continue;
          qtyByGroup.set(group.id, (qtyByGroup.get(group.id) ?? 0) + (item.quantity ?? 1));
        }
      }

      const rateByGroup = new Map<string, number>();
      for (const g of groups) rateByGroup.set(g.id, rateForQuantity(g, qtyByGroup.get(g.id) ?? 0));

      for (const o of monthOrders) {
        const items = o.items ?? [];
        if (isCancelled(o)) {
          result.set(o.id, items.map(() => ZERO_ITEM));
          continue;
        }
        const perItem = items.map((item): ItemCommissionInfo => {
          const product = productById.get(item.id ?? item.productId ?? '');
          if (!product) return ZERO_ITEM;
          const group = groupOfProduct(product, groups);
          if (!group) return ZERO_ITEM;
          const rate = rateByGroup.get(group.id) ?? 0;
          const perUnit = itemCommissionAtRate(
            item.price ?? product.price,
            product.costPrice,
            group.fallbackRate,
            rate,
          );
          return {
            amount: perUnit * (item.quantity ?? 1),
            groupName: group.name,
            groupQty: qtyByGroup.get(group.id) ?? 0,
            rate,
          };
        });
        result.set(o.id, perItem);
      }
    }
    return result;
  }

  private buildSummary(
    uid: string,
    name: string,
    orders: Order[],
    groups: CommissionGroup[],
    products: Product[],
  ): CollaboratorCommissionSummary {
    const map = this.computeByMonth(orders, groups, products);
    const summary: CollaboratorCommissionSummary = {
      collaboratorUid: uid,
      collaboratorName: name,
      orders: [],
      totalSales: 0,
      totalCommission: 0,
      pendingCommission: 0,
      paidCommission: 0,
    };

    for (const order of orders) {
      const perItem = map.get(order.id) ?? [];
      const items = (order.items ?? []).map((it, i) => ({
        ...it,
        commissionAmount: perItem[i]?.amount ?? 0,
        commissionGroupName: perItem[i]?.groupName || undefined,
        commissionGroupQty: perItem[i]?.groupQty || undefined,
        commissionRate: perItem[i]?.rate || undefined,
      }));
      const commissionAmount = perItem.reduce((a, b) => a + b.amount, 0);
      summary.orders.push({ ...order, items, commissionAmount });
      if (!isCancelled(order)) {
        const productSales = (order.total ?? 0) - (order.shippingCost ?? 0);
        summary.totalSales += productSales > 0 ? productSales : 0;
        summary.totalCommission += commissionAmount;
        if (order.commissionStatus === 'paid') summary.paidCommission += commissionAmount;
        else summary.pendingCommission += commissionAmount;
      }
    }

    summary.orders.sort((a, b) => {
      const da = a.deliveryDate ? new Date(a.deliveryDate).getTime() : 0;
      const db = b.deliveryDate ? new Date(b.deliveryDate).getTime() : 0;
      return db - da;
    });
    return summary;
  }

  // ── API methods ───────────────────────────────────────────
  async getAllSummaries(): Promise<CollaboratorCommissionSummary[]> {
    const [groups, products, collaborators] = await Promise.all([
      this.fetchGroups(),
      this.fetchProducts(),
      this.fetchCollaborators(),
    ]);
    if (collaborators.length === 0) return [];

    const ordersByUid = new Map<string, Order[]>();
    const CHUNK = 30;
    for (let i = 0; i < collaborators.length; i += CHUNK) {
      const uids = collaborators.slice(i, i + CHUNK).map((c) => c.uid);
      const snap = await this.fs
        .collection('orders')
        .where('createdBy', 'in', uids)
        .get();
      snap.forEach((d) => {
        const order = this.mapOrder(d.id, d.data() as Record<string, unknown>);
        const uid = order.createdBy || '';
        if (!ordersByUid.has(uid)) ordersByUid.set(uid, []);
        ordersByUid.get(uid)!.push(order);
      });
    }

    const summaries: CollaboratorCommissionSummary[] = [];
    for (const ctv of collaborators) {
      const orders = ordersByUid.get(ctv.uid) ?? [];
      if (orders.length === 0) continue;
      summaries.push(this.buildSummary(ctv.uid, ctv.name, orders, groups, products));
    }
    return summaries.sort((a, b) => b.pendingCommission - a.pendingCommission);
  }

  async getMySummary(uid: string, name: string): Promise<CollaboratorCommissionSummary> {
    const [groups, products] = await Promise.all([this.fetchGroups(), this.fetchProducts()]);
    const snap = await this.fs.collection('orders').where('createdBy', '==', uid).get();
    const orders = snap.docs.map((d) => this.mapOrder(d.id, d.data() as Record<string, unknown>));
    return this.buildSummary(uid, name, orders, groups, products);
  }

  async setPaidStatus(orderIds: string[], paid: boolean): Promise<void> {
    if (orderIds.length === 0) return;
    const paidAt = paid ? new Date().toISOString() : null;
    const BATCH = 450;
    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batch = this.fs.firestore.batch();
      for (const id of orderIds.slice(i, i + BATCH)) {
        batch.update(this.fs.collection('orders').doc(id), {
          commissionStatus: paid ? 'paid' : 'pending',
          commissionPaidAt: paid ? paidAt : admin.firestore.FieldValue.delete(),
        });
      }
      await batch.commit();
    }
  }
}
