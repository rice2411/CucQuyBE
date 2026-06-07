import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthUser } from '../../auth/user.types';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(FirebaseAuthGuard)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  /** Danh sách đơn hàng (đã enrich createdBy = tên hiển thị). */
  @Get()
  fetchOrders() {
    return this.service.fetchOrders();
  }

  /** Sinh số đơn kế tiếp. */
  @Get('next-number')
  async getNextOrderNumber() {
    return { orderNumber: await this.service.getNextOrderNumber() };
  }

  /** Tạo đơn — trả order đã tạo (gồm id + orderNumber) để FE gửi Zalo. */
  @Post()
  addOrder(
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addOrder(body, user);
  }

  /** Cập nhật đơn (check quyền CTV + ghi history). */
  @Patch(':id')
  updateOrder(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateOrder(id, body, user);
  }

  /** Xoá đơn — trả { id, prevOrder } để FE gửi Zalo delete notify. */
  @Delete(':id')
  deleteOrder(@Param('id') id: string) {
    return this.service.deleteOrder(id);
  }
}
