
-- 1. Tracking events table
CREATE TABLE public.email_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('open','click')),
  campaign_id UUID REFERENCES public.platform_email_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.platform_email_campaign_recipients(id) ON DELETE CASCADE,
  url TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_tracking_events_campaign ON public.email_tracking_events(campaign_id, created_at DESC);
CREATE INDEX idx_email_tracking_events_recipient ON public.email_tracking_events(recipient_id, created_at DESC);

GRANT SELECT ON public.email_tracking_events TO authenticated;
GRANT ALL ON public.email_tracking_events TO service_role;

ALTER TABLE public.email_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_read_tracking" ON public.email_tracking_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

-- 2. Campaign triggers
CREATE TABLE public.platform_campaign_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.platform_email_campaigns(id) ON DELETE CASCADE,
  template_slug TEXT,  -- if set & campaign_id null, applies to all future campaigns using this template
  condition TEXT NOT NULL CHECK (condition IN ('not_opened','not_clicked','not_activated')),
  delay_hours INTEGER NOT NULL DEFAULT 72 CHECK (delay_hours > 0),
  action_template_slug TEXT NOT NULL REFERENCES public.platform_email_templates(slug) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_follow_ups INTEGER NOT NULL DEFAULT 1 CHECK (max_follow_ups BETWEEN 1 AND 2),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (campaign_id IS NOT NULL OR template_slug IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_campaign_triggers TO authenticated;
GRANT ALL ON public.platform_campaign_triggers TO service_role;

ALTER TABLE public.platform_campaign_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_manage_triggers" ON public.platform_campaign_triggers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER set_updated_at_platform_campaign_triggers
  BEFORE UPDATE ON public.platform_campaign_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Aggregate columns on recipients
ALTER TABLE public.platform_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_clicked_url TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;

-- 4. Track recipient activation (so triggers can detect 'not_activated')
ALTER TABLE public.platform_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
