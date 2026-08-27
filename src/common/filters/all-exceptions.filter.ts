import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const path = request.raw?.url || request.url || '';

    // Log the original error with full stack before sending response
    if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception on ${request.method || 'GET'} ${path}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method || 'GET'} ${path}: ${String(exception)}`,
      );
    }

    const message = isHttpException ? exception.message : 'Internal server error';

    const error = isHttpException ? exception.name : 'Internal Server Error';

    response.status(status).send({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
