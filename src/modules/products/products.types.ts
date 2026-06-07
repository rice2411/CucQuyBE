/**
 * Types domain Product — port từ FE (types/product.ts).
 * Giữ NGUYÊN shape để FE không phải sửa.
 */

export interface ProductMaterial {
  materialId: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  /** Ảnh phụ (gallery) */
  gallery?: string[];
  category: string;
  tags?: string[];
  description?: string;
  status: 'active' | 'inactive' | string;
  materials?: ProductMaterial[];
  createdAt?: string; // ISO
  costPrice?: number;
  commissionRate?: number;
  badgeIds?: string[];
  stockUnit?: string;
  currentStock?: number;
  lowStockThreshold?: number;
}

export interface ProductVersion {
  id: string;
  productId: string;
  action: 'update' | string;
  editedAt?: string; // ISO
  before?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
