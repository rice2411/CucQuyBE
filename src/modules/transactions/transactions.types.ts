export interface Transaction {
  id: string;
  accountNumber: string;
  accumulated: number;
  code: string | null;
  content: string;
  createdAt: string;
  description: string;
  gateway: string;
  orderNumber: string;
  receivedAt: string;
  referenceCode: string;
  sepayId: number;
  subAccount: string;
  transactionDate: string;
  transferType: string; // 'in' | 'out'
  transferAmount: number;
  /** Giao dịch không liên quan đến hệ thống (đánh dấu thủ công) */
  isExternal?: boolean;
}
