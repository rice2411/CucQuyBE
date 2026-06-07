import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import {
  BadgesConfiguration,
  CustomerBadgeRule,
  CustomerBadgeRuleType,
  OrderBadge,
  ProductBadge,
} from './badges.types';

const CONFIG_COLLECTION = 'configurations';
const BADGES_DOC = 'badges';

const randomId = (): string =>
  (admin.firestore as any)?.AutoId?.newId?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

@Injectable()
export class BadgesService {
  constructor(private readonly fs: FirestoreService) {}

  // ── Type-guards (coi dữ liệu Firestore là untrusted) ──────────
  private sanitizeOrderBadges(raw: unknown): OrderBadge[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((it): it is Record<string, unknown> => it != null && typeof it === 'object')
      .map((o) => ({
        id: typeof o.id === 'string' && o.id ? o.id : randomId(),
        name: typeof o.name === 'string' ? o.name : '',
        color: typeof o.color === 'string' && o.color ? o.color : '#64748b',
        icon: typeof o.icon === 'string' ? o.icon : undefined,
        description: typeof o.description === 'string' ? o.description : undefined,
        sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : 0,
      }))
      .filter((b) => b.name.trim().length > 0)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  private sanitizeProductBadges(raw: unknown): ProductBadge[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((it): it is Record<string, unknown> => it != null && typeof it === 'object')
      .map((o) => ({
        id: typeof o.id === 'string' && o.id ? o.id : randomId(),
        name: typeof o.name === 'string' ? o.name : '',
        color: typeof o.color === 'string' && o.color ? o.color : '#22c55e',
        icon: typeof o.icon === 'string' ? o.icon : undefined,
        description: typeof o.description === 'string' ? o.description : undefined,
        sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : 0,
      }))
      .filter((b) => b.name.trim().length > 0)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  private sanitizeCustomerRules(raw: unknown): CustomerBadgeRule[] {
    if (!Array.isArray(raw)) return [];
    const VALID_TYPES: CustomerBadgeRuleType[] = ['orderCount', 'totalSpent', 'avgOrderValue'];
    return raw
      .filter((it): it is Record<string, unknown> => it != null && typeof it === 'object')
      .map((o) => {
        const ruleType: CustomerBadgeRuleType = VALID_TYPES.includes(
          o.ruleType as CustomerBadgeRuleType,
        )
          ? (o.ruleType as CustomerBadgeRuleType)
          : 'orderCount';
        const operator = ['>=', '>', '<', '<='].includes(o.operator as string)
          ? (o.operator as CustomerBadgeRule['operator'])
          : '>=';
        return {
          id: typeof o.id === 'string' && o.id ? o.id : randomId(),
          name: typeof o.name === 'string' ? o.name : '',
          color: typeof o.color === 'string' && o.color ? o.color : '#22c55e',
          icon: typeof o.icon === 'string' ? o.icon : undefined,
          ruleType,
          operator,
          threshold:
            typeof o.threshold === 'number' && Number.isFinite(o.threshold) ? o.threshold : 0,
          description: typeof o.description === 'string' ? o.description : undefined,
          sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : 0,
        };
      })
      .filter((r) => r.name.trim().length > 0)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // ── API methods ───────────────────────────────────────────
  async fetchBadgesConfiguration(): Promise<BadgesConfiguration> {
    const ref = this.fs.collection(CONFIG_COLLECTION).doc(BADGES_DOC);
    const snap = await ref.get();
    if (!snap.exists) return { orderBadges: [], productBadges: [], customerRules: [] };
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const updatedAt = data.updatedAt as admin.firestore.Timestamp | undefined;
    return {
      orderBadges: this.sanitizeOrderBadges(data.orderBadges),
      productBadges: this.sanitizeProductBadges(data.productBadges),
      customerRules: this.sanitizeCustomerRules(data.customerRules),
      updatedAt: updatedAt?.toDate?.()?.toISOString?.(),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
    };
  }

  async saveBadgesConfiguration(
    orderBadges: OrderBadge[],
    productBadges: ProductBadge[],
    customerRules: CustomerBadgeRule[],
    updatedBy?: string | null,
  ): Promise<void> {
    const ref = this.fs.collection(CONFIG_COLLECTION).doc(BADGES_DOC);
    await ref.set(
      {
        orderBadges: this.sanitizeOrderBadges(orderBadges),
        productBadges: this.sanitizeProductBadges(productBadges),
        customerRules: this.sanitizeCustomerRules(customerRules),
        updatedBy: updatedBy ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}
