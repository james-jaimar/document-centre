-- Add Microsoft Graph (OAuth client credentials) as a transport option for email_accounts.
-- Existing rows default to 'smtp' so nothing changes for them.

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS graph_tenant_id text,
  ADD COLUMN IF NOT EXISTS graph_client_id text,
  ADD COLUMN IF NOT EXISTS graph_client_secret_id uuid,
  ADD COLUMN IF NOT EXISTS graph_sender_address text;

-- SMTP columns become nullable so 'graph' rows don't need them.
ALTER TABLE public.email_accounts ALTER COLUMN smtp_host DROP NOT NULL;
ALTER TABLE public.email_accounts ALTER COLUMN smtp_port DROP NOT NULL;
ALTER TABLE public.email_accounts ALTER COLUMN smtp_secure DROP NOT NULL;
ALTER TABLE public.email_accounts ALTER COLUMN smtp_username DROP NOT NULL;

-- Validation trigger (project rule: no CHECK constraints with mutable logic).
CREATE OR REPLACE FUNCTION public.validate_email_account_transport()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transport NOT IN ('smtp', 'graph') THEN
    RAISE EXCEPTION 'transport must be smtp or graph (got %)', NEW.transport;
  END IF;

  IF NEW.transport = 'smtp' THEN
    IF NEW.smtp_host IS NULL OR NEW.smtp_port IS NULL
       OR NEW.smtp_secure IS NULL OR NEW.smtp_username IS NULL THEN
      RAISE EXCEPTION 'SMTP transport requires smtp_host, smtp_port, smtp_secure, smtp_username';
    END IF;
  ELSIF NEW.transport = 'graph' THEN
    IF NEW.graph_tenant_id IS NULL OR NEW.graph_client_id IS NULL
       OR NEW.graph_client_secret_id IS NULL OR NEW.graph_sender_address IS NULL THEN
      RAISE EXCEPTION 'Graph transport requires graph_tenant_id, graph_client_id, graph_client_secret_id, graph_sender_address';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_email_account_transport_trg ON public.email_accounts;
CREATE TRIGGER validate_email_account_transport_trg
BEFORE INSERT OR UPDATE ON public.email_accounts
FOR EACH ROW
EXECUTE FUNCTION public.validate_email_account_transport();