-- Configurable system email nudges: platform-controlled schedule + send log
CREATE TABLE IF NOT EXISTS public.platform_nudge_settings (
  nudge_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  offsets_days integer[] NOT NULL DEFAULT '{}',
  min_hours_between_sends integer NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.platform_nudge_settings TO authenticated;
GRANT ALL ON public.platform_nudge_settings TO service_role;

ALTER TABLE public.platform_nudge_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read nudge settings"
ON public.platform_nudge_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "Platform admins manage nudge settings"
ON public.platform_nudge_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Seed the v1 nudge catalog
INSERT INTO public.platform_nudge_settings (nudge_key, label, description, enabled, offsets_days) VALUES
  ('trial_expiring',       'Trial expiring soon',   'Warn branch admins as trial_ends_at approaches.',                    true,  ARRAY[7,3,1]),
  ('trial_expired',        'Trial expired',         'Notify branch admins on/after trial_ends_at until they subscribe.',  true,  ARRAY[0,2,7]),
  ('payment_past_due',     'Payment failed / grace','Warn while billing is past_due and grace_until is set.',              true,  ARRAY[3,1]),
  ('subscription_cancelled','Subscription cancelled','One-off note when a subscription flips to cancelled/force_cancel.', true,  ARRAY[0]),
  ('onboarding_stalled',   'Onboarding stalled',    'Nudge branches whose activation checklist is still incomplete.',     true,  ARRAY[3,7,14])
ON CONFLICT (nudge_key) DO NOTHING;

-- Per-send dedupe log
CREATE TABLE IF NOT EXISTS public.nudge_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  nudge_key text NOT NULL,
  offset_day integer NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  outbox_id uuid,
  UNIQUE (branch_id, nudge_key, offset_day, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_nudge_send_log_branch ON public.nudge_send_log(branch_id, nudge_key);

GRANT SELECT ON public.nudge_send_log TO authenticated;
GRANT ALL ON public.nudge_send_log TO service_role;

ALTER TABLE public.nudge_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read nudge log"
ON public.nudge_send_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Hourly dispatcher cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nudge-dispatcher-hourly') THEN
    PERFORM cron.unschedule('nudge-dispatcher-hourly');
  END IF;
  PERFORM cron.schedule(
    'nudge-dispatcher-hourly',
    '5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/nudge-dispatcher',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmRodGFxb3VteW9ranFhcWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODE5NzgsImV4cCI6MjA4OTA1Nzk3OH0.RUTPHUm_hHpeB59pZXnEcaCFtr7PkfCAw0-lvXuG9WA"}'::jsonb,
      body := jsonb_build_object('trigger','cron','ts', now())
    );
    $cron$
  );
END $$;