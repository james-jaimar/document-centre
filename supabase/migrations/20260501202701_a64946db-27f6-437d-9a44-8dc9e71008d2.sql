
-- Add Gmail OAuth columns to email_accounts
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS oauth_refresh_token_secret_id uuid,
  ADD COLUMN IF NOT EXISTS oauth_email text;

-- Drop the existing transport check constraint and trigger, then recreate with gmail_oauth
-- First find and drop the CHECK constraint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.email_accounts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%transport%'
  LOOP
    EXECUTE format('ALTER TABLE public.email_accounts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Replace the trigger function to support gmail_oauth
CREATE OR REPLACE FUNCTION public.validate_email_account_transport()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.transport NOT IN ('smtp', 'graph', 'gmail_oauth') THEN
    RAISE EXCEPTION 'transport must be smtp, graph, or gmail_oauth (got %)', NEW.transport;
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
  ELSIF NEW.transport = 'gmail_oauth' THEN
    IF NEW.oauth_refresh_token_secret_id IS NULL OR NEW.oauth_email IS NULL THEN
      RAISE EXCEPTION 'Gmail OAuth transport requires oauth_refresh_token_secret_id and oauth_email';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
