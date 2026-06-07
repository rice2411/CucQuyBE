import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthUser } from '../../auth/user.types';
import { ResponseMessage } from '../../common/response-message.decorator';
import { CategoriesService } from './categories.service';
import { ProductCategory } from './categories.types';

@Controller('categories')
@UseGuards(FirebaseAuthGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  /** Lấy toàn bộ danh mục sản phẩm. */
  @Get()
  fetch(): Promise<ProductCategory[]> {
    return this.service.fetchCategories();
  }

  /** Lưu toàn bộ danh sách danh mục (ghi đè). */
  @Put()
  @ResponseMessage('Đã lưu danh mục')
  save(
    @Body() body: ProductCategory[],
    @CurrentUser() user: AuthUser,
  ): Promise<ProductCategory[]> {
    return this.service.saveCategories(body, {
      uid: user.uid,
      displayName: user.displayName,
    });
  }
}
