import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import { Product, ProductMaterial, ProductVersion } from './products.types';

const COL = 'products';
const VERSIONS_COL = 'product_versions';

/** Loại bỏ field undefined trước khi ghi Firestore. */
const omitUndefined = (
  obj: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

@Injectable()
export class ProductsService {
  constructor(private readonly fs: FirestoreService) {}

  // ── Đọc (type-guard mọi field) ────────────────────────────
  async fetchProducts(): Promise<Product[]> {
    const snap = await this.fs
      .collection(COL)
      .orderBy('createdAt', 'desc')
      .get();

    return snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;

      let materials: ProductMaterial[] = Array.isArray(r.materials)
        ? (r.materials as any[]).map((m) => ({
            materialId: typeof m?.materialId === 'string' ? m.materialId : '',
            quantity: typeof m?.quantity === 'number' ? m.quantity : 1,
          }))
        : [];

      if (
        materials.length === 0 &&
        Array.isArray(r.materialIds) &&
        (r.materialIds as unknown[]).length > 0
      ) {
        materials = (r.materialIds as unknown[])
          .filter((id) => typeof id === 'string')
          .map((id) => ({ materialId: id as string, quantity: 1 }));
      }

      const createdAt = r.createdAt as
        | admin.firestore.Timestamp
        | undefined;

      return {
        id: d.id,
        name: typeof r.name === 'string' ? r.name : '',
        price: typeof r.price === 'number' ? r.price : Number(r.price) || 0,
        image: typeof r.image === 'string' ? r.image : '',
        gallery: Array.isArray(r.gallery)
          ? (r.gallery as unknown[]).filter(
              (g): g is string => typeof g === 'string',
            )
          : undefined,
        category: typeof r.category === 'string' ? r.category : 'General',
        tags: Array.isArray(r.tags)
          ? (r.tags as unknown[]).filter(
              (t): t is string => typeof t === 'string',
            )
          : [],
        description: typeof r.description === 'string' ? r.description : '',
        status: typeof r.status === 'string' ? r.status : 'active',
        materials,
        createdAt:
          createdAt && typeof createdAt.toDate === 'function'
            ? createdAt.toDate().toISOString()
            : new Date().toISOString(),
        costPrice: typeof r.costPrice === 'number' ? r.costPrice : undefined,
        commissionRate:
          typeof r.commissionRate === 'number' ? r.commissionRate : undefined,
        badgeIds: Array.isArray(r.badgeIds)
          ? (r.badgeIds as unknown[]).filter(
              (b): b is string => typeof b === 'string',
            )
          : undefined,
        stockUnit: typeof r.stockUnit === 'string' ? r.stockUnit : undefined,
        currentStock:
          typeof r.currentStock === 'number' ? r.currentStock : undefined,
        lowStockThreshold:
          typeof r.lowStockThreshold === 'number'
            ? r.lowStockThreshold
            : undefined,
      } as Product;
    });
  }

  // ── Ghi ────────────────────────────────────────────────────
  async addProduct(
    productData: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const { id: _ignore, ...rest } = productData;
    const ref = await this.fs.collection(COL).add({
      ...omitUndefined(rest),
      createdAt: admin.firestore.Timestamp.now(),
    });
    return { id: ref.id };
  }

  async updateProduct(
    id: string,
    productData: Record<string, unknown>,
  ): Promise<void> {
    const { id: _ignore, ...rest } = productData;
    const updates = omitUndefined(rest);
    if (Object.keys(updates).length === 0) return;

    const productRef = this.fs.collection(COL).doc(id);
    const versionsRef = this.fs.collection(VERSIONS_COL);

    await this.fs.firestore.runTransaction(async (tx) => {
      const currentSnap = await tx.get(productRef);
      if (!currentSnap.exists) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const before = currentSnap.data() as Record<string, unknown>;
      const after = { ...before, ...updates };

      tx.update(productRef, updates);
      tx.set(versionsRef.doc(), {
        productId: id,
        editedAt: admin.firestore.Timestamp.now(),
        action: 'update',
        before,
        changes: updates,
        after,
      });
    });
  }

  /**
   * Xoá field costPrice — đưa sản phẩm ra khỏi danh sách "đã có hoa hồng".
   * Dùng FieldValue.delete() vì updateProduct bỏ qua field undefined.
   */
  async removeProductCostPrice(id: string): Promise<void> {
    const productRef = this.fs.collection(COL).doc(id);
    const versionsRef = this.fs.collection(VERSIONS_COL);

    await this.fs.firestore.runTransaction(async (tx) => {
      const currentSnap = await tx.get(productRef);
      if (!currentSnap.exists) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const before = currentSnap.data() as Record<string, unknown>;
      if (before.costPrice === undefined) return;

      const after = { ...before };
      delete after.costPrice;

      tx.update(productRef, {
        costPrice: admin.firestore.FieldValue.delete(),
      });
      tx.set(versionsRef.doc(), {
        productId: id,
        editedAt: admin.firestore.Timestamp.now(),
        action: 'update',
        before,
        changes: { costPrice: null },
        after,
      });
    });
  }

  async deleteProduct(id: string): Promise<void> {
    await this.fs.collection(COL).doc(id).delete();
  }

  async fetchProductVersions(productId: string): Promise<ProductVersion[]> {
    const mapVersion = (
      docSnap: admin.firestore.QueryDocumentSnapshot,
    ): ProductVersion => {
      const data = docSnap.data() as Record<string, unknown>;
      const editedAt = data.editedAt as
        | admin.firestore.Timestamp
        | undefined;
      return {
        id: docSnap.id,
        productId: typeof data.productId === 'string' ? data.productId : '',
        action: typeof data.action === 'string' ? data.action : 'update',
        editedAt:
          editedAt && typeof editedAt.toDate === 'function'
            ? editedAt.toDate().toISOString()
            : undefined,
        before: (data.before as Record<string, unknown>) || {},
        changes: (data.changes as Record<string, unknown>) || {},
        after: (data.after as Record<string, unknown>) || {},
      };
    };

    const snap = await this.fs
      .collection(VERSIONS_COL)
      .where('productId', '==', productId)
      .orderBy('editedAt', 'desc')
      .get();
    return snap.docs.map(mapVersion);
  }
}
