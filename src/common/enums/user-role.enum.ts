/**
 * User roles for RBAC (Role-Based Access Control).
 *
 * These values mirror the `user_role` Postgres enum defined in
 * migration 20260820000000_add_role_column_to_users.sql.
 *
 * Usage:
 *   @Roles(UserRole.ADMIN)          — admin only
 *   @Roles(UserRole.BORROWER, UserRole.ADMIN)  — borrower or admin
 */
export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
  LP_PROVIDER = 'lp_provider',
  BORROWER = 'borrower',
}
