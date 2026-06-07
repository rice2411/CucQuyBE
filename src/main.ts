import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.enableCors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');

  await app.listen(config.port);
  Logger.log(`🚀 CucQuyBakery API chạy tại :${config.port}/api`, 'Bootstrap');
}
bootstrap();
