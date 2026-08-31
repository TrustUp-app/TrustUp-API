import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../../../src/common/guards/roles.guard';
import { UserRole } from '../../../../src/common/enums/user-role.enum';
import { ROLES_KEY } from '../../../../src/common/decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const mockContext = (role?: UserRole): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: role
            ? { wallet: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW', role }
            : undefined,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  // ---------------------------------------------------------------------------
  // No @Roles() decorator — should allow any authenticated user
  // ---------------------------------------------------------------------------
  describe('when no @Roles() metadata is set', () => {
    it('should allow access (any authenticated user)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      expect(guard.canActivate(mockContext(UserRole.BORROWER))).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      expect(guard.canActivate(mockContext(UserRole.BORROWER))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // @Roles() set — matching role
  // ---------------------------------------------------------------------------
  describe('when user role matches required roles', () => {
    it('should allow access for exact role match', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
      expect(guard.canActivate(mockContext(UserRole.ADMIN))).toBe(true);
    });

    it('should allow access when user has one of multiple allowed roles', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.BORROWER, UserRole.ADMIN]);
      expect(guard.canActivate(mockContext(UserRole.BORROWER))).toBe(true);
    });

    it('should allow admin access to borrower+admin endpoints', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.BORROWER, UserRole.ADMIN]);
      expect(guard.canActivate(mockContext(UserRole.ADMIN))).toBe(true);
    });

    it('should allow lp_provider access to LP endpoints', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.LP_PROVIDER, UserRole.ADMIN]);
      expect(guard.canActivate(mockContext(UserRole.LP_PROVIDER))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // @Roles() set — non-matching role
  // ---------------------------------------------------------------------------
  describe('when user role does not match required roles', () => {
    it('should throw ForbiddenException (AUTH_ROLE_FORBIDDEN) for non-matching role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

      expect(() => guard.canActivate(mockContext(UserRole.BORROWER))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(mockContext(UserRole.BORROWER))).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'AUTH_ROLE_FORBIDDEN' }),
        }),
      );
    });

    it('should throw ForbiddenException when borrower accesses LP-only endpoint', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.LP_PROVIDER, UserRole.ADMIN]);

      expect(() => guard.canActivate(mockContext(UserRole.BORROWER))).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when merchant accesses admin-only endpoint', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

      expect(() => guard.canActivate(mockContext(UserRole.MERCHANT))).toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should throw ForbiddenException when user object is missing', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user has no role property', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { wallet: 'GABC...' } }),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
