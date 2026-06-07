/** Chi phí khác (nhập tay) — trừ vào lợi nhuận ngoài hoa hồng & nhập kho */
export type ExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'salary'
  | 'marketing'
  | 'equipment'
  | 'other';

export interface Expense {
  id: string;
  description: string;
  /** Số tiền (VND) */
  amount: number;
  /** Ngày chi (ISO yyyy-mm-dd) */
  date: string;
  category: ExpenseCategory;
  note?: string;
  createdAt?: string;
  createdBy?: string;
}
