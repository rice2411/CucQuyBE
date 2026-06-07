import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { ZaloService, ZaloSendPayload } from './zalo.service';

@ApiTags('Zalo')
@Controller('zalo')
@UseGuards(FirebaseAuthGuard)
export class ZaloController {
  constructor(private readonly service: ZaloService) {}

  @Post('send')
  send(@Body() payload: ZaloSendPayload) {
    return this.service.send(payload);
  }
}
