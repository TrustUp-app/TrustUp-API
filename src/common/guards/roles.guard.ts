import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';

/**
 * Authorization guard that enforces role-based access control.
 *
 * Reads the roles metadata set by the @Roles() decorator and compares
 * against the authenticated user's role (available on req.user.role,
 * set by JwtStrategy.validate()).
 *
 * Behavior:
 *   - No @Roles() decorator → allow (any authenticated user)
 *   - @Roles(...) set and user.role ∈ roles → allow
 *   - @Roles(...) set and user.role ∉ roles → ForbiddenException
 *
 * Must be used AFTER JwtAuthGuard in the guards chain:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'AUTH_ROLE_FORBIDDEN',
        message: 'Access denied. Insufficient permissions.',
      });
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException({
        code: 'AUTH_ROLE_FORBIDDEN',
        message: 'Access denied. Insufficient permissions.',
      });
    }

    return true;
  }
}
