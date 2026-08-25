-- Migration: add role column to users table
-- Description: Introduces the user_role enum and adds a `role` column to the
--              users table for RBAC (Role-Based Access Control).
--
-- Roles:
--   · admin       — full platform access; can override loans, approve merchants,
--                   manage user roles, and access system health details
--   · merchant    — can receive BNPL payments from borrowers (future endpoints)
--   · lp_provider — can deposit/withdraw from the liquidity pool
--   · borrower    — default role; can request and repay BNPL loans
--
-- All existing users are set to 'borrower' by default.
-- Idempotent: uses IF NOT EXISTS / DO $$ checks to allow safe re-runs.

-- =============================================================================
-- 1. ENUM: user_role
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'admin',
      'merchant',
      'lp_provider',
      'borrower'
    );
  end if;
end;
$$;

-- =============================================================================
-- 2. ADD COLUMN
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'role'
  ) then
    alter table public.users
      add column role public.user_role not null default 'borrower';
  end if;
end;
$$;

-- =============================================================================
-- 3. INDEX
-- =============================================================================
-- Partial index for admin lookups (minority case, like the status index pattern)
create index if not exists idx_users_role
  on public.users (role);

-- =============================================================================
-- 4. COMMENTS
-- =============================================================================
comment on column public.users.role is
  'User role for RBAC. Determines endpoint access. '
  'Values: admin, merchant, lp_provider, borrower. '
  'Default: borrower. Only admins can change roles via PATCH /admin/users/:id/role.';
