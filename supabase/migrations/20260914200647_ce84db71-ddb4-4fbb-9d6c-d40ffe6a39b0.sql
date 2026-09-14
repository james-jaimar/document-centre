ALTER TABLE public.platform_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS org_name text;

CREATE INDEX IF NOT EXISTS platform_email_campaign_recipients_campaign_status_idx
  ON public.platform_email_campaign_recipients (campaign_id, status);