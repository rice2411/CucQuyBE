import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import { ProductCategory } from './categories.types';

const CONFIG_COLLECTION = 'configurations';
const CATEGORIES_DOC = 'categories';

@Injectable()
export class CategoriesService {
  constructor(private readonly fs: FirestoreService) {}

  /** Type-guard danh sách thô từ Firestore / client. */
  private sanitize(raw: unknown): ProductCategory[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any, idx: number): ProductCategory | null => {
        if (!item || typeof item !== 'object') return null;
        const id = String(item.id || '').trim();
        const name = String(item.name || '').trim();
        if (!id || !name) return null;
        return {
          id,
          name,
          parentId: item.parentId ? String(item.parentId) : null,
          icon: item.icon ? String(item.icon) : undefined,
          color: item.color ? String(item.color) : undefined,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx,
          description: item.description ? String(item.description) : undefined,
        };
      })
      .filter((c): c is ProductCategory => c !== null);
  }

  private docRef() {
    return this.fs.collection(CONFIG_COLLECTION).doc(CATEGORIES_DOC);
  }

  async fetchCategories(): Promise<ProductCategory[]> {
    const snap = await this.docRef().get();
    if (!snap.exists) return [];
    const data = snap.data() as { categories?: unknown };
    return this.sanitize(data?.categories);
  }

  async saveCategories(
    categories: unknown,
    actor?: { uid?: string; displayName?: string },
  ): Promise<ProductCategory[]> {
    const sanitized = this.sanitize(categories);
    await this.docRef().set(
      {
        categories: sanitized,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor?.displayName || actor?.uid || 'system',
      },
      { merge: true },
    );
    return sanitized;
  }
}
