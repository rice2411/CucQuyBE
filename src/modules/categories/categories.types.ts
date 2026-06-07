/**
 * Danh mục sản phẩm — hỗ trợ cấu trúc cây (parent/child) qua `parentId`.
 * Lưu trong document `configurations/categories`, field `categories` (array).
 */
export interface ProductCategory {
  id: string;
  name: string;
  /** Parent category id — null/undefined = root */
  parentId?: string | null;
  /** Icon emoji (vd: '🍞', '🧁') */
  icon?: string;
  /** Hex color cho chip hiển thị */
  color?: string;
  /** Vị trí sort trong cùng level (số nhỏ hiện trước) */
  sortOrder?: number;
  /** Mô tả tùy chọn */
  description?: string;
}
