import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { TransformInterceptor } from './common/transform.interceptor';

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
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.setGlobalPrefix('api');

  // Swagger UI — http://localhost:<port>/api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CucQuy Bakery API')
    .setDescription('Backend NestJS — Firestore qua firebase-admin. Hầu hết endpoint cần Firebase ID token (Bearer).')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Firebase ID token' },
      'firebase',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Áp Bearer cho mọi route (nhập token 1 lần ở nút Authorize là gọi được hết)
  document.security = [{ firebase: [] }];
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.port);
  Logger.log(`🚀 CucQuyBakery API chạy tại :${config.port}/api`, 'Bootstrap');
  Logger.log(`📖 Swagger UI: :${config.port}/api/docs`, 'Bootstrap');
}
bootstrap();
