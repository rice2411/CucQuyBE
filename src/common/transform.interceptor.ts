import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE } from './response-message.decorator';
import { HttpStatusCode, messageForStatus } from './http-status';

export interface ApiResponse<T> {
  data: T | null;
  message: string;
  statusCode: number;
  success: boolean;
}

/** Bọc mọi response thành công về format { data, message, statusCode, success: true }. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const res = context.switchToHttp().getResponse();
    const statusCode: number = res.statusCode ?? HttpStatusCode.OK;
    const customMessage = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const message = customMessage || messageForStatus(statusCode);

    return next.handle().pipe(
      map((data: T) => ({
        data: data ?? null,
        message,
        statusCode,
        success: true,
      })),
    );
  }
}
