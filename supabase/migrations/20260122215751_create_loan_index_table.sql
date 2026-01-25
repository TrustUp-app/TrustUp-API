-- Migration: create loan_index table (off-chain BNPL view)
-- Idempotent: uses IF NOT EXISTS checks

-- 1. Define loan_status enum: active, paid, defaulted
do $$
begin
  if not exists (select 1 from pg_type where typname = 'loan_status') then
    create type public.loan_status as enum ('active', 'paid', 'defaulted');
  end if;
end;
$$;

-- 2. Create table with unique constraint on loan_id
create table if not exists public.loan_index (
  id uuid primary key default gen_random_uuid(),
  loan_id text unique not null,
  user_wallet text not null,
  status public.loan_status not null,
  principal_amount numeric not null,
  interest_amount numeric not null,
  due_date timestamptz,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 3. Add indexes
create index if not exists loan_index_user_wallet_idx on public.loan_index (user_wallet);
create index if not exists loan_index_status_idx on public.loan_index (status);
create index if not exists loan_index_due_date_idx on public.loan_index (due_date);
