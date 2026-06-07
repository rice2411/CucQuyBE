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

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  /** ISO yyyy-mm-dd */
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
