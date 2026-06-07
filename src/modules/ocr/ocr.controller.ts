import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { OcrService } from './ocr.service';
import { VisionOcrDto } from './dto/vision-ocr.dto';

@Controller('ocr')
@UseGuards(FirebaseAuthGuard)
export class OcrController {
  constructor(private readonly service: OcrService) {}

  /** Trích xuất text từ ảnh base64 qua Google Vision. */
  @Post('vision')
  async vision(@Body() dto: VisionOcrDto) {
    const text = await this.service.extractText(dto.content);
    return { text };
  }
}
