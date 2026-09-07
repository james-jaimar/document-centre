ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS resend_api_key_secret_id uuid,
  ADD COLUMN IF NOT EXISTS resend_segment_id text,
  ADD COLUMN IF NOT EXISTS resend_webhook_secret_id uuid;

COMMENT ON COLUMN public.email_accounts.resend_api_key_secret_id IS 'Vault secret id holding the tenant''s own Resend API key (transport = resend).';
COMMENT ON COLUMN public.email_accounts.resend_segment_id IS 'Resend segment (contact list) id used for this account''s broadcasts.';

ALTER TABLE public.platform_email_campaigns
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mailbox',
  ADD COLUMN IF NOT EXISTS resend_broadcast_id text,
  ADD COLUMN IF NOT EXISTS resend_segment_id text;

ALTER TABLE public.platform_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS resend_contact_id text;

CREATE INDEX IF NOT EXISTS platform_email_campaigns_resend_broadcast_idx
  ON public.platform_email_campaigns (resend_broadcast_id);

CREATE OR REPLACE FUNCTION public.validate_email_account_transport()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transport NOT IN ('smtp', 'graph', 'gmail_oauth', 'graph_oauth', 'resend') THEN
    RAISE EXCEPTION 'transport must be smtp, graph, gmail_oauth, graph_oauth or resend (got %)', NEW.transport;
  END IF;

  IF NEW.transport = 'smtp' THEN
    IF NEW.smtp_host IS NULL OR NEW.smtp_port IS NULL OR NEW.smtp_secure IS NULL OR NEW.smtp_username IS NULL THEN
      RAISE EXCEPTION 'SMTP transport requires smtp_host, smtp_port, smtp_secure, smtp_username';
    END IF;
  ELSIF NEW.transport = 'graph' THEN
    IF NEW.graph_tenant_id IS NULL OR NEW.graph_client_id IS NULL OR NEW.graph_client_secret_id IS NULL OR NEW.graph_sender_address IS NULL THEN
      RAISE EXCEPTION 'Graph transport requires graph_tenant_id, graph_client_id, graph_client_secret_id, graph_sender_address';
    END IF;
  ELSIF NEW.transport IN ('gmail_oauth', 'graph_oauth') THEN
    IF NEW.oauth_refresh_token_secret_id IS NULL OR NEW.oauth_email IS NULL THEN
      RAISE EXCEPTION '% transport requires oauth_refresh_token_secret_id and oauth_email', NEW.transport;
    END IF;
  ELSIF NEW.transport = 'resend' THEN
    IF NEW.resend_api_key_secret_id IS NULL OR NEW.from_email IS NULL THEN
      RAISE EXCEPTION 'Resend transport requires resend_api_key_secret_id and from_email';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;