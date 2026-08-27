import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const key = context.switchToHttp().getRequest().headers['idempotency-key'];
    if (key === undefined) return undefined;

    const value = Array.isArray(key) ? key[0] : key;
    if (typeof value !== 'string' || !UUID_V4.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be a UUID v4.',
      });
    }

    return value;
  },
);
