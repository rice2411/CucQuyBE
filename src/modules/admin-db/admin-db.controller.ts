import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { AdminDbService } from './admin-db.service';

@Controller('admin-db')
@UseGuards(FirebaseAuthGuard)
export class AdminDbController {
  constructor(private readonly service: AdminDbService) {}

  /**
   * Đồng bộ ảnh (và optionally tên) sản phẩm vào item của mọi đơn hàng.
   * Khai báo trước route ':collection' để không bị nuốt làm tham số động.
   */
  @Post('sync-product-images')
  syncProductImages(@Body() body: { includeName?: boolean }) {
    return this.service.syncProductImagesToOrders(body?.includeName ?? true);
  }

  /** Liệt kê toàn bộ document của 1 collection (chỉ trong allowlist). */
  @Get(':collection')
  listCollection(@Param('collection') collection: string) {
    return this.service.listCollection(collection);
  }

  /** Xoá HẾT document trong collection (chỉ trong allowlist). */
  @Delete(':collection')
  deleteCollection(@Param('collection') collection: string) {
    return this.service.deleteCollection(collection);
  }
}
