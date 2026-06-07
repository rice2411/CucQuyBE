import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../../firebase/firestore.service';
import { Transaction } from './transactions.types';

const COL = 'transactions';

/** Chuẩn hoá field ngày từ Firestore (Timestamp / string) về ISO string. */
const toDateStr = (val: unknown): string => {
  if (!val) return new Date().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    const toDate = (val as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      return (toDate.call(val) as Date).toISOString();
    }
  }
  return String(val);
};

@Injectable()
export class TransactionsService {
  constructor(private readonly fs: FirestoreService) {}

  /** Map 1 doc Firestore → Transaction (type-guard mọi field). */
  private mapTransaction(id: string, r: Record<string, unknown>): Transaction {
    return {
      id,
      accountNumber: typeof r.accountNumber === 'string' ? r.accountNumber : '',
      accumulated: typeof r.accumulated === 'number' ? r.accumulated : Number(r.accumulated) || 0,
      code: typeof r.code === 'string' ? r.code : null,
      content: typeof r.content === 'string' ? r.content : '',
      createdAt: toDateStr(r.createdAt),
      description: typeof r.description === 'string' ? r.description : '',
      gateway: typeof r.gateway === 'string' ? r.gateway : '',
      orderNumber: typeof r.orderNumber === 'string' ? r.orderNumber : '',
      receivedAt: toDateStr(r.receivedAt),
      referenceCode: typeof r.referenceCode === 'string' ? r.referenceCode : '',
      sepayId: typeof r.sepayId === 'number' ? r.sepayId : Number(r.sepayId) || 0,
      subAccount: typeof r.subAccount === 'string' ? r.subAccount : '',
      transactionDate: toDateStr(r.transactionDate),
      transferAmount:
        typeof r.transferAmount === 'number' ? r.transferAmount : Number(r.transferAmount) || 0,
      transferType: typeof r.transferType === 'string' ? r.transferType : 'in',
      isExternal: r.isExternal === true,
    };
  }

  async fetchTransactions(): Promise<Transaction[]> {
    const snap = await this.fs.collection(COL).orderBy('transactionDate', 'desc').get();
    return snap.docs.map((d) => this.mapTransaction(d.id, d.data() as Record<string, unknown>));
  }

  async fetchTransactionsByOrderNumber(orderNumber: string): Promise<Transaction[]> {
    const snap = await this.fs.collection(COL).where('orderNumber', '==', orderNumber).get();
    return snap.docs.map((d) => this.mapTransaction(d.id, d.data() as Record<string, unknown>));
  }

  /** Đánh dấu giao dịch là không liên quan đến hệ thống (hoặc bỏ đánh dấu). */
  async markTransactionExternal(id: string, isExternal: boolean): Promise<void> {
    await this.fs.collection(COL).doc(id).update({ isExternal });
  }

  /** Liên kết giao dịch với 1 đơn (ghi orderNumber); chuỗi rỗng = gỡ liên kết. */
  async linkTransactionOrder(id: string, orderNumber: string): Promise<void> {
    await this.fs.collection(COL).doc(id).update({ orderNumber });
  }
}
