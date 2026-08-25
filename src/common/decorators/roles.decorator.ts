import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

/**
 * Metadata key used by RolesGuard to read allowed roles from route handlers.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator that restricts access to endpoints based on user roles.
 *
 * Apply to individual route handlers or entire controllers.
 * Must be used together with @UseGuards(JwtAuthGuard, RolesGuard).
 *
 * When no @Roles() decorator is present, RolesGuard allows access
 * to any authenticated user (backward compatibility).
 *
 * @example
 *   @Roles(UserRole.ADMIN)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Get('admin-only')
 *   getAdminData() { ... }
 *
 * @example
 *   @Roles(UserRole.BORROWER, UserRole.ADMIN)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Post('create')
 *   createLoan() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
