alter table public.loans add column if not exists xdr_hash text;

create unique index if not exists idx_loans_pending_user_xdr_hash
  on public.loans (user_wallet, xdr_hash)
  where status = 'pending' and xdr_hash is not null;
