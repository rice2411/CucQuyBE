import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/roles.decorator';
import { WebhooksService } from './webhooks.service';

/**
 * Webhook PUBLIC (SePay / Facebook gọi tới, KHÔNG có Firebase token).
 * Dùng @Res() để trả ĐÚNG format gốc (bypass envelope toàn cục) — nhà cung
 * cấp webhook kỳ vọng body riêng, không phải {data,message,...}.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Public()
  @Post('sepay')
  async sepay(@Body() body: any, @Res() res: Response) {
    try {
      const { status, payload } = await this.service.handleSepay(body);
      res.status(status).json(payload);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'error' });
    }
  }

  @Public()
  @Post('facebook')
  async facebook(@Body() body: any, @Res() res: Response) {
    try {
      const { status, payload } = await this.service.handleFacebook(body);
      res.status(status).json(payload);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'error' });
    }
  }
}
