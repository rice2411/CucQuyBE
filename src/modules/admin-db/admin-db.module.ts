import { Module } from '@nestjs/common';
import { AdminDbController } from './admin-db.controller';
import { AdminDbService } from './admin-db.service';

@Module({
  controllers: [AdminDbController],
  providers: [AdminDbService],
})
export class AdminDbModule {}
