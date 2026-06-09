import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole } from '../../auth/user.types';
import { RequestLogsService } from './request-logs.service';
import { QueryLogsDto, StatsLogsDto } from './dto/query-logs.dto';

/** Nhật ký request — chỉ admin xem được. */
@ApiTags('Nhật ký Request')
@Controller('request-logs')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class RequestLogsController {
  constructor(private readonly service: RequestLogsService) {}

  /** Danh sách log có lọc + phân trang. */
  @Get()
  list(@Query() query: QueryLogsDto) {
    return this.service.queryLogs(query);
  }

  /** Thống kê tổng quan (tổng request, lỗi, IP duy nhất, top path/IP). */
  @Get('stats')
  stats(@Query() query: StatsLogsDto) {
    return this.service.stats(query);
  }
}
