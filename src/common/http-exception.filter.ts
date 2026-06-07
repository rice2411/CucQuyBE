import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpStatusCode, messageForStatus } from './http-status';

/** Chuẩn hoá lỗi về JSON { data, message, statusCode, success, path }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatusCode.INTERNAL_SERVER_ERROR;

    let message: unknown = messageForStatus(status);
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      message = typeof r === 'string' ? r : (r as { message?: unknown }).message ?? r;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.stack);
    }

    res.status(status).json({
      data: null,
      message,
      statusCode: status,
      success: false,
      path: req.url,
    });
  }
}
