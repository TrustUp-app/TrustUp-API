import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

export interface StandardResponse<T> {
  success: true;
  data: T;
  message?: string;
}

function isAlreadyEnveloped(value: unknown): value is StandardResponse<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

/**
 * Wraps every controller response in the { success, data, message? } envelope
 * documented in docs/development/response-standards.md. Controllers that
 * already build their own envelope (an object with a `success` key) are
 * passed through unchanged — this only fills the gap for endpoints that
 * return their raw service result without wrapping it.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<StandardResponse<T> | T> {
    const message = this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler());

    return next.handle().pipe(
      map((result: T) => {
        if (result === undefined || result === null) {
          // Leave 204/void responses untouched.
          return result;
        }
        if (isAlreadyEnveloped(result)) {
          return result as StandardResponse<T>;
        }

        const envelope: StandardResponse<T> = { success: true, data: result };
        if (message) {
          envelope.message = message;
        }
        return envelope;
      }),
    );
  }
}
