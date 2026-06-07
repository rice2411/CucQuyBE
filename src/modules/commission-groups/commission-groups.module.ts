import { Module } from '@nestjs/common';
import { CommissionGroupsController } from './commission-groups.controller';
import { CommissionGroupsService } from './commission-groups.service';

@Module({
  controllers: [CommissionGroupsController],
  providers: [CommissionGroupsService],
})
export class CommissionGroupsModule {}
