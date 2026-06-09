import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global → mọi module inject RedisService không cần import lại. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
