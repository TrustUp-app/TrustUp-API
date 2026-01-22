-- Migration: create reputation_cache table and supporting enum/indexes
-- Idempotent: uses IF NOT EXISTS checks to allow safe re-runs

-- Enum for reputation tier
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reputation_tier') then
    create type public.reputation_tier as enum ('bronze', 'silver', 'gold');
  end if;
end;
$$;

-- Core reputation cache table
create table if not exists public.reputation_cache (
  user_id uuid primary key references public.users(id) on delete cascade,
  wallet_address text not null,
  score integer not null,
  tier public.reputation_tier,
  last_synced_at timestamp default now()
);

-- Score range constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reputation_cache_score_range_check'
  ) then
    alter table public.reputation_cache
      add constraint reputation_cache_score_range_check
      check (score >= 0 and score <= 1000);
  end if;
end;
$$;

-- Indexes for common queries
create index if not exists idx_reputation_cache_wallet_address
  on public.reputation_cache (wallet_address);
create index if not exists idx_reputation_cache_last_synced_at
  on public.reputation_cache (last_synced_at);
