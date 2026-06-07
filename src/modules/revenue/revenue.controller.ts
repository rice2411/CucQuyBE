import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RevenueService } from './revenue.service';

@Controller('revenue')
@UseGuards(FirebaseAuthGuard)
export class RevenueController {
  constructor(private readonly service: RevenueService) {}

  /** GET /revenue/report?from=<ISO>&to=<ISO> → báo cáo P&L trong kỳ. */
  @Get('report')
  getReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getReport(from ?? '', to ?? '');
  }
}
