import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from '../../../../src/common/interceptors/transform.interceptor';
import { RESPONSE_MESSAGE_KEY } from '../../../../src/common/decorators/response-message.decorator';

function context(): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('TransformInterceptor', () => {
  it('wraps a raw result in the standard envelope', async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const next: CallHandler = { handle: () => of({ id: 'abc' }) };

    const result = await lastValueFrom(interceptor.intercept(context(), next));

    expect(result).toEqual({ success: true, data: { id: 'abc' } });
  });

  it('includes the @ResponseMessage metadata when present', async () => {
    const reflector = {
      get: jest.fn((key: string) =>
        key === RESPONSE_MESSAGE_KEY ? 'Created successfully' : undefined,
      ),
    } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const next: CallHandler = { handle: () => of({ id: 'abc' }) };

    const result = await lastValueFrom(interceptor.intercept(context(), next));

    expect(result).toEqual({
      success: true,
      data: { id: 'abc' },
      message: 'Created successfully',
    });
  });

  it('passes through a result that already has a success key', async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const already = { success: true, data: { flattened: true }, message: 'custom' };
    const next: CallHandler = { handle: () => of(already) };

    const result = await lastValueFrom(interceptor.intercept(context(), next));

    expect(result).toBe(already);
  });

  it('does not wrap undefined/void responses (204s)', async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const next: CallHandler = { handle: () => of(undefined) };

    const result = await lastValueFrom(interceptor.intercept(context(), next));

    expect(result).toBeUndefined();
  });
});
