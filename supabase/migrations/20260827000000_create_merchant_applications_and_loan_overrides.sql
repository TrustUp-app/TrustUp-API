-- Migration: create merchant_applications and loan_overrides tables
-- Description: Adds schema for merchant application submission and review lifecycle,
--              and loan override audit trail for administrative actions.
-- Idempotent: supports safe re-runs with IF NOT EXISTS

CREATE TABLE IF NOT EXISTS public.merchant_applications (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         REFERENCES public.users(id) ON DELETE CASCADE,
  wallet           VARCHAR(56)  NOT NULL,
  name             VARCHAR(255) NOT NULL,
  logo             TEXT,
  description      TEXT,
  category         VARCHAR(100),
  website          TEXT,
  status           TEXT         NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by      UUID         REFERENCES public.users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_applications_wallet_format_check'
  ) THEN
    ALTER TABLE public.merchant_applications
      ADD CONSTRAINT merchant_applications_wallet_format_check
      CHECK (wallet ~ '^G[A-Z2-7]{55}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_applications_status_check'
  ) THEN
    ALTER TABLE public.merchant_applications
      ADD CONSTRAINT merchant_applications_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_applications_wallet ON public.merchant_applications(wallet);
CREATE INDEX IF NOT EXISTS idx_merchant_applications_status ON public.merchant_applications(status);
CREATE INDEX IF NOT EXISTS idx_merchant_applications_user_id ON public.merchant_applications(user_id);

-- Auto-update updated_at trigger for merchant_applications
CREATE OR REPLACE FUNCTION public.set_merchant_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_merchant_applications_updated_at'
  ) THEN
    CREATE TRIGGER trg_merchant_applications_updated_at
    BEFORE UPDATE ON public.merchant_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_merchant_applications_updated_at();
  END IF;
END;
$$;

-- Loan Overrides Table (Audit Trail)
CREATE TABLE IF NOT EXISTS public.loan_overrides (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id          UUID         REFERENCES public.loans(id) ON DELETE CASCADE,
  admin_id         UUID         REFERENCES public.users(id),
  admin_wallet     VARCHAR(56)  NOT NULL,
  previous_status  TEXT         NOT NULL,
  new_status       TEXT         NOT NULL,
  action           TEXT         NOT NULL,
  reason           TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_overrides_loan_id ON public.loan_overrides(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_overrides_admin_wallet ON public.loan_overrides(admin_wallet);

-- Update loan status constraint if needed to include 'cancelled'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_status_check'
  ) THEN
    ALTER TABLE public.loans DROP CONSTRAINT loans_status_check;
  END IF;

  ALTER TABLE public.loans
    ADD CONSTRAINT loans_status_check
    CHECK (status IN ('pending', 'active', 'completed', 'defaulted', 'cancelled'));
END;
$$;

-- Comments
COMMENT ON TABLE public.merchant_applications IS 'Tracks merchant onboarding applications and review status.';
COMMENT ON TABLE public.loan_overrides IS 'Audit trail for administrative loan status overrides.';
