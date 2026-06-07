import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../../firebase/firestore.service';
import {
  CommissionGroup,
  CommissionTier,
  DEFAULT_COMMISSION_GROUPS,
} from './commission-groups.types';

const COL = 'commissionGroups';

/** Loại bỏ field undefined trước khi ghi Firestore. */
const omitUndefined = (
  obj: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Type-guard mảng tiers thô từ Firestore. */
const guardTiers = (raw: unknown): CommissionTier[] =>
  Array.isArray(raw)
    ? (raw as unknown[]).map((t) => {
        const r = (t ?? {}) as Record<string, unknown>;
        return {
          minQty: typeof r.minQty === 'number' ? r.minQty : 1,
          profitShareRate:
            typeof r.profitShareRate === 'number' ? r.profitShareRate : 0,
        };
      })
    : [];

@Injectable()
export class CommissionGroupsService {
  constructor(private readonly fs: FirestoreService) {}

  /** Map 1 field thô (đã có id) sang CommissionGroup type-safe. */
  private toGroup(id: string, r: Record<string, unknown>): CommissionGroup {
    return {
      id,
      name: typeof r.name === 'string' ? r.name : '',
      minMargin: typeof r.minMargin === 'number' ? r.minMargin : 0,
      maxMargin: typeof r.maxMargin === 'number' ? r.maxMargin : 1,
      tiers: guardTiers(r.tiers),
      profitShareRate:
        typeof r.profitShareRate === 'number' ? r.profitShareRate : undefined,
      fallbackRate: typeof r.fallbackRate === 'number' ? r.fallbackRate : 0,
      order: typeof r.order === 'number' ? r.order : 0,
    };
  }

  /** Lấy danh sách nhóm hoa hồng. Nếu chưa có, seed defaults vào Firestore. */
  async fetchCommissionGroups(): Promise<CommissionGroup[]> {
    const snap = await this.fs.collection(COL).orderBy('order', 'asc').get();

    if (!snap.empty) {
      return snap.docs.map((d) =>
        this.toGroup(d.id, d.data() as Record<string, unknown>),
      );
    }

    // Seed defaults
    const batch = this.fs.firestore.batch();
    const seeded: CommissionGroup[] = [];
    for (const g of DEFAULT_COMMISSION_GROUPS) {
      const ref = this.fs.collection(COL).doc();
      batch.set(ref, g);
      seeded.push({ id: ref.id, ...g });
    }
    await batch.commit();
    return seeded;
  }

  /** Tạo nhóm mới — trả về group mới có id. */
  async createCommissionGroup(
    data: Record<string, unknown>,
  ): Promise<CommissionGroup> {
    const { id: _ignore, ...rest } = data;
    const payload = omitUndefined(rest);
    const ref = await this.fs.collection(COL).add(payload);
    return this.toGroup(ref.id, payload);
  }

  /** Cập nhật nhóm */
  async updateCommissionGroup(
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const { id: _ignore, ...rest } = data;
    const updates = omitUndefined(rest);
    if (Object.keys(updates).length === 0) return;
    await this.fs.collection(COL).doc(id).update(updates);
  }

  /** Xoá nhóm */
  async deleteCommissionGroup(id: string): Promise<void> {
    await this.fs.collection(COL).doc(id).delete();
  }
}
