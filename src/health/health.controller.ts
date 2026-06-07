import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/roles.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'cucquy-bakery-server', time: new Date().toISOString() };
  }
}
