import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './firebase/firebase.module';
import { HealthController } from './health/health.controller';
import { CommissionModule } from './modules/commission/commission.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirebaseModule,
    CommissionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
