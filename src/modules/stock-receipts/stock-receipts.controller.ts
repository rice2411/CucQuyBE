import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthUser } from '../../auth/user.types';
import { StockReceiptsService } from './stock-receipts.service';
import { BillPipelineService } from './bill-pipeline.service';
import { ProcessBillDto } from './dto/process-bill.dto';
import {
  SaveStockReceiptDraftInput,
  SupplierContactInfo,
} from './stock-receipts.types';

@Controller('stock-receipts')
@UseGuards(FirebaseAuthGuard)
export class StockReceiptsController {
  constructor(
    private readonly service: StockReceiptsService,
    private readonly billPipeline: BillPipelineService,
  ) {}

  /** OCR + Gemini + gating: xử lý ảnh bill thành phiếu nhập (chưa lưu). */
  @Post('process-bill')
  processBill(@Body() dto: ProcessBillDto) {
    return this.billPipeline.processBill(dto.imageBase64);
  }

  /** Danh sách NCC đã nhập. */
  @Get('suppliers')
  fetchImportedSuppliers() {
    return this.service.fetchImportedSuppliers();
  }

  /** Danh sách nguyên liệu đã nhập. */
  @Get('materials')
  fetchImportedMaterials() {
    return this.service.fetchImportedMaterials();
  }

  /** Nguyên liệu kèm đơn giá nhập TB (dropdown OrderForm). */
  @Get('material-options')
  fetchMaterialPriceOptions() {
    return this.service.fetchMaterialPriceOptions();
  }

  /** Danh sách phiếu nhập (summary). */
  @Get()
  fetchStockReceiptSummaries() {
    return this.service.fetchStockReceiptSummaries();
  }

  /** Chi tiết 1 phiếu nhập. */
  @Get(':id')
  fetchStockReceiptDetail(@Param('id') id: string) {
    return this.service.fetchStockReceiptDetail(id);
  }

  /** Cập nhật thông tin NCC. */
  @Patch('suppliers/:id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() body: Partial<SupplierContactInfo> & { name?: string },
  ) {
    await this.service.updateSupplier(id, body);
    return { id };
  }

  /** Lưu phiếu nhập (tạo receipt + lines + upsert supplier/materials). */
  @Post('draft')
  saveStockReceiptDraft(
    @Body() body: SaveStockReceiptDraftInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveStockReceiptDraft({
      ...body,
      createdByUid: user?.uid ?? null,
    });
  }

  /** Gộp nhiều NCC trùng vào 1 root. */
  @Post('suppliers/merge')
  async mergeSuppliers(
    @Body() body: { rootId: string; duplicateIds: string[] },
  ) {
    await this.service.mergeSuppliers(body.rootId, body.duplicateIds ?? []);
    return { ok: true };
  }

  /** Gộp nhiều nguyên liệu trùng vào 1 root. */
  @Post('materials/merge')
  async mergeMaterials(
    @Body() body: { rootId: string; duplicateIds: string[] },
  ) {
    await this.service.mergeMaterials(body.rootId, body.duplicateIds ?? []);
    return { ok: true };
  }
}
