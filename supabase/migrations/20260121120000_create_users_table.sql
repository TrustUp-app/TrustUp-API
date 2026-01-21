-- Migration: create users table and supporting enum/trigger
-- Idempotent: uses IF NOT EXISTS checks to allow safe re-runs

-- Enum for user status
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type public.user_status as enum ('active', 'blocked');
  end if;
end;
$$;

-- Core users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  username text,
  display_name text,
  avatar_url text,
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Unique wallet_address constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_wallet_address_key'
  ) then
    alter table public.users
      add constraint users_wallet_address_key unique (wallet_address);
  end if;
end;
$$;

-- Stellar wallet address format validation (Starts with G, 56 chars, base32)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_wallet_address_format_check'
  ) then
    alter table public.users
      add constraint users_wallet_address_format_check 
      check (wallet_address ~ '^G[A-Z2-7]{55}$');
  end if;
end;
$$;


-- Unique username constraint (nullable unique)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_username_key'
  ) then
    alter table public.users
      add constraint users_username_key unique (username);
  end if;
end;
$$;

-- Index for fast wallet lookups
create index if not exists idx_users_wallet_address on public.users (wallet_address);

-- Trigger function to maintain updated_at
create or replace function public.set_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger attaching updated_at behavior
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_users_updated_at'
  ) then
    create trigger trg_users_updated_at
    before update on public.users
    for each row
    execute function public.set_users_updated_at();
  end if;
end;
$$;
