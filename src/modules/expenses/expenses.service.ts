import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import { Expense, ExpenseCategory } from './expenses.types';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const COL = 'expenses';

@Injectable()
export class ExpensesService {
  constructor(private readonly fs: FirestoreService) {}

  private mapExpense(id: string, r: Record<string, unknown>): Expense {
    const createdAt =
      r.createdAt instanceof admin.firestore.Timestamp
        ? r.createdAt.toDate().toISOString()
        : undefined;
    return {
      id,
      description: typeof r.description === 'string' ? r.description : '',
      amount: typeof r.amount === 'number' ? r.amount : 0,
      date: typeof r.date === 'string' ? r.date : '',
      category: (typeof r.category === 'string'
        ? r.category
        : 'other') as ExpenseCategory,
      note: typeof r.note === 'string' ? r.note : undefined,
      createdAt,
      createdBy: typeof r.createdBy === 'string' ? r.createdBy : undefined,
    };
  }

  async findAll(): Promise<Expense[]> {
    const snap = await this.fs.collection(COL).orderBy('date', 'desc').get();
    return snap.docs.map((d) =>
      this.mapExpense(d.id, d.data() as Record<string, unknown>),
    );
  }

  async create(dto: CreateExpenseDto): Promise<{ id: string }> {
    const ref = await this.fs
      .collection(COL)
      .add({ ...dto, createdAt: admin.firestore.Timestamp.now() });
    return { id: ref.id };
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<void> {
    await this.fs
      .collection(COL)
      .doc(id)
      .update({ ...dto });
  }

  async remove(id: string): Promise<void> {
    await this.fs.collection(COL).doc(id).delete();
  }
}
