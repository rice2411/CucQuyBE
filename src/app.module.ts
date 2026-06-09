import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './firebase/firebase.module';
import { HealthController } from './health/health.controller';
import { CommissionModule } from './modules/commission/commission.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BadgesModule } from './modules/badges/badges.module';
import { CommissionGroupsModule } from './modules/commission-groups/commission-groups.module';
import { ConfigurationsModule } from './modules/configurations/configurations.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StockReceiptsModule } from './modules/stock-receipts/stock-receipts.module';
import { AdminDbModule } from './modules/admin-db/admin-db.module';
import { ImagesModule } from './modules/images/images.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SerpapiModule } from './modules/serpapi/serpapi.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { GeminiModule } from './modules/gemini/gemini.module';
import { ZaloModule } from './modules/zalo/zalo.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { RequestLogsModule } from './modules/request-logs/request-logs.module';
import { LoggingMiddleware } from './modules/request-logs/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirebaseModule,
    CommissionModule,
    ProductsModule,
    CustomersModule,
    ExpensesModule,
    TransactionsModule,
    CategoriesModule,
    BadgesModule,
    CommissionGroupsModule,
    ConfigurationsModule,
    UsersModule,
    OrdersModule,
    StockReceiptsModule,
    AdminDbModule,
    ImagesModule,
    WebhooksModule,
    SerpapiModule,
    OcrModule,
    GeminiModule,
    ZaloModule,
    RevenueModule,
    RequestLogsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  // Áp LoggingMiddleware cho mọi route → ghi nhật ký request.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
