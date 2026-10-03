import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminApiKeyGuard } from '../../../../src/common/guards/admin-api-key.guard';

describe('AdminApiKeyGuard', () => {
  const ADMIN_KEY = 'super-secret-admin-key';

  let guard: AdminApiKeyGuard;
  let config: { get: jest.Mock };

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue(ADMIN_KEY) };
    guard = new AdminApiKeyGuard(config as unknown as ConfigService);
  });

  const mockContext = (provided?: string | string[]): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: provided === undefined ? {} : { 'x-admin-key': provided },
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  it('allows access when the provided key matches', () => {
    expect(guard.canActivate(mockContext(ADMIN_KEY))).toBe(true);
  });

  it('throws ForbiddenException when the key does not match', () => {
    expect(() => guard.canActivate(mockContext('wrong-key'))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the header is missing', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('rejects a key of different length without throwing a non-HTTP error', () => {
    const shorter = ADMIN_KEY.slice(0, ADMIN_KEY.length - 1);
    const longer = `${ADMIN_KEY}-extra`;

    for (const candidate of [shorter, longer]) {
      expect(() => guard.canActivate(mockContext(candidate))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(mockContext(candidate))).not.toThrow(TypeError);
    }
  });

  it('rejects a longer key with a matching prefix', () => {
    expect(() => guard.canActivate(mockContext(`${ADMIN_KEY}0`))).toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when ADMIN_API_KEY is not configured', () => {
    config.get.mockReturnValue(undefined);

    expect(() => guard.canActivate(mockContext(ADMIN_KEY))).toThrow(UnauthorizedException);
  });
});