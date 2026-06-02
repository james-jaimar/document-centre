-- Phase 1: Email dispatch rebuild — additive schema changes

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_error_code text;

CREATE INDEX IF NOT EXISTS idx_email_outbox_due
  ON public.email_outbox (scheduled_for)
  WHERE status IN ('queued','retry');

CREATE INDEX IF NOT EXISTS idx_email_outbox_lease
  ON public.email_outbox (worker_lease_until)
  WHERE status = 'sending';

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS max_concurrency integer NOT NULL DEFAULT 4;

-- email_send_metrics
CREATE TABLE IF NOT EXISTS public.email_send_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_at timestamptz NOT NULL,
  tenant_id uuid,
  email_account_id uuid,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  avg_latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_at, tenant_id, email_account_id)
);
GRANT ALL ON public.email_send_metrics TO service_role;
ALTER TABLE public.email_send_metrics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_send_metrics_bucket ON public.email_send_metrics (bucket_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_metrics_tenant ON public.email_send_metrics (tenant_id, bucket_at DESC);

-- email_events
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text,
  outbox_id uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  recipient text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_message_id, event_type, recipient)
);
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_events_msgid ON public.email_events (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_received ON public.email_events (received_at DESC);

-- email_suppressions
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- claim_email_batch RPC
CREATE OR REPLACE FUNCTION public.claim_email_batch(
  p_worker_id text,
  p_batch_size integer DEFAULT 50,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.email_outbox
    WHERE status IN ('queued','retry')
      AND (scheduled_for IS NULL OR scheduled_for <= now())
    ORDER BY scheduled_for NULLS FIRST, created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox o
     SET status = 'sending',
         claimed_by = p_worker_id,
         claimed_at = now(),
         worker_lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = o.attempts + 1
    FROM due
   WHERE o.id = due.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_batch(text,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(text,integer,integer) TO service_role;

-- release_stuck_claims RPC
CREATE OR REPLACE FUNCTION public.release_stuck_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.email_outbox
     SET status = 'retry',
         claimed_by = NULL,
         claimed_at = NULL,
         worker_lease_until = NULL
   WHERE status = 'sending'
     AND worker_lease_until IS NOT NULL
     AND worker_lease_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stuck_claims() FROM public;
GRANT EXECUTE ON FUNCTION public.release_stuck_claims() TO service_role;