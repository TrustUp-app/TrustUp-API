-- Columns used by loan-default-detector, interest-accrual, and yield-distribution jobs.

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS accrued_interest NUMERIC(20, 7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accrual_at TIMESTAMPTZ;

ALTER TABLE public.liquidity_positions
  ADD COLUMN IF NOT EXISTS lifetime_yield NUMERIC(20, 7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_yield_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.loan_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  period_key TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_name, period_key)
);

COMMENT ON COLUMN public.loans.accrued_interest IS 'Interest accrued off-chain by the interest-accrual job.';
COMMENT ON TABLE public.loan_job_runs IS 'Idempotency cursor for daily/hourly loan lifecycle jobs.';
