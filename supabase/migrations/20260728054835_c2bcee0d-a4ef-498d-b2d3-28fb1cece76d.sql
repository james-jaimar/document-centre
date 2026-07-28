ALTER TABLE public.platform_email_campaigns
  ADD COLUMN IF NOT EXISTS parent_campaign_id uuid NULL
  REFERENCES public.platform_email_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS platform_email_campaigns_parent_idx
  ON public.platform_email_campaigns(parent_campaign_id)
  WHERE parent_campaign_id IS NOT NULL;