-- Outbound merchant webhook subscriptions and delivery logs (issue #133)

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT ARRAY['loan.status_changed']::TEXT[],
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, url)
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_merchant ON public.webhook_endpoints(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON public.webhook_endpoints(is_active);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  event         TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'success', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  response_code INTEGER,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON public.webhook_deliveries(created_at DESC);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_endpoints IS 'Merchant-registered outbound webhook URLs. Nest uses the service role key.';
COMMENT ON TABLE public.webhook_deliveries IS 'Per-attempt log for outbound webhook deliveries.';
COMMENT ON COLUMN public.webhook_deliveries.event_id IS 'Idempotency key for a single logical event (endpoint + event_id unique).';
