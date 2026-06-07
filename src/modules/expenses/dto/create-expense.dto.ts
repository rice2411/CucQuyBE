import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseCategory } from '../expenses.types';

const CATEGORIES: ExpenseCategory[] = [
  'rent',
  'utilities',
  'salary',
  'marketing',
  'equipment',
  'other',
];

export class CreateExpenseDto {
  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  /** ISO yyyy-mm-dd */
  @IsString()
  date!: string;

  @IsIn(CATEGORIES)
  category!: ExpenseCategory;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
