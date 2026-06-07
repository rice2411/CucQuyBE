import { BadRequestException, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';

/**
 * Allowlist các collection root được phép thao tác qua công cụ admin database.
 * Khớp với DATABASE_COLLECTIONS mà Settings FE dùng, kèm vài collection nội bộ
 * (commissionGroups, product_versions...) để đủ dùng cho công cụ quản trị.
 */
const ALLOWED_COLLECTIONS = new Set<string>([
  'products',
  'orders',
  'customers',
  'transactions',
  'expenses',
  'materials',
  'suppliers',
  'stock_receipts',
  'commissionGroups',
  'configurations',
  'users',
  'product_versions',
  'facebook_messages',
]);

const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';
const DELETE_BATCH_SIZE = 450;

/** Chuyển Timestamp / object lồng nhau thành dạng JSON serializable. */
const toSerializable = (value: unknown): unknown => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toSerializable);
  if (typeof value === 'object') {
    const maybeTs = value as { toDate?: () => Date };
    if (typeof maybeTs.toDate === 'function') {
      try {
        return maybeTs.toDate().toISOString();
      } catch {
        return String(value);
      }
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        toSerializable(v),
      ]),
    );
  }
  return value;
};

@Injectable()
export class AdminDbService {
  constructor(private readonly fs: FirestoreService) {}

  private assertAllowed(collection: string): void {
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      throw new BadRequestException(
        `Collection không được phép: ${collection}`,
      );
    }
  }

  /** Liệt kê toàn bộ document của 1 collection (chỉ trong allowlist). */
  async listCollection(
    collection: string,
  ): Promise<{ id: string; data: Record<string, unknown> }[]> {
    this.assertAllowed(collection);
    const snap = await this.fs.collection(collection).get();
    return snap.docs.map((d) => ({
      id: d.id,
      data: toSerializable(d.data()) as Record<string, unknown>,
    }));
  }

  /** Xoá HẾT document trong collection (batch theo lô). Trả số doc đã xoá. */
  async deleteCollection(collection: string): Promise<{ deleted: number }> {
    this.assertAllowed(collection);
    const snap = await this.fs.collection(collection).get();
    const refs = snap.docs.map((d) => d.ref);

    for (let i = 0; i < refs.length; i += DELETE_BATCH_SIZE) {
      const batch = this.fs.firestore.batch();
      for (const ref of refs.slice(i, i + DELETE_BATCH_SIZE)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return { deleted: refs.length };
  }

  /**
   * Đồng bộ ảnh (và optionally tên) sản phẩm vào item của mọi đơn hàng.
   * Ghi đè item.image và item.name nếu khác giá trị hiện tại của product.
   */
  async syncProductImagesToOrders(
    includeName: boolean,
  ): Promise<{ ordersScanned: number; ordersUpdated: number; itemsFixed: number }> {
    const productsSnap = await this.fs.collection(PRODUCTS_COLLECTION).get();
    const productMap = new Map<string, { image?: string; name?: string }>();
    productsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      productMap.set(d.id, {
        image: typeof data.image === 'string' ? data.image : undefined,
        name: typeof data.name === 'string' ? data.name : undefined,
      });
    });

    const ordersSnap = await this.fs.collection(ORDERS_COLLECTION).get();
    type ItemLike = { id?: unknown; name?: unknown; image?: unknown };
    interface OrderToUpdate {
      ref: admin.firestore.DocumentReference;
      items: ItemLike[];
    }
    const toUpdate: OrderToUpdate[] = [];
    let itemsFixed = 0;

    for (const orderDoc of ordersSnap.docs) {
      const data = orderDoc.data() as { items?: ItemLike[] };
      const items: ItemLike[] = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) continue;

      let dirty = false;
      const nextItems = items.map((it) => {
        if (!it || typeof it.id !== 'string') return it;
        const p = productMap.get(it.id);
        if (!p) return it;
        const updated: ItemLike = { ...it };
        let changed = false;
        if (p.image !== undefined && it.image !== p.image) {
          updated.image = p.image;
          changed = true;
        }
        if (includeName && p.name !== undefined && it.name !== p.name) {
          updated.name = p.name;
          changed = true;
        }
        if (changed) {
          dirty = true;
          itemsFixed += 1;
        }
        return updated;
      });

      if (dirty) {
        toUpdate.push({ ref: orderDoc.ref, items: nextItems });
      }
    }

    for (let i = 0; i < toUpdate.length; i += DELETE_BATCH_SIZE) {
      const batch = this.fs.firestore.batch();
      for (const { ref, items } of toUpdate.slice(i, i + DELETE_BATCH_SIZE)) {
        batch.update(ref, {
          items,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
      await batch.commit();
    }

    return {
      ordersScanned: ordersSnap.size,
      ordersUpdated: toUpdate.length,
      itemsFixed,
    };
  }
}
