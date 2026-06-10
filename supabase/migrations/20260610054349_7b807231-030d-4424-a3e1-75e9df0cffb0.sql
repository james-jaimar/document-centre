CREATE OR REPLACE FUNCTION public.validate_email_account_transport()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.transport NOT IN ('smtp', 'graph', 'gmail_oauth', 'graph_oauth') THEN
    RAISE EXCEPTION 'transport must be smtp, graph, gmail_oauth, or graph_oauth (got %)', NEW.transport;
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
  ELSIF NEW.transport IN ('gmail_oauth', 'graph_oauth') THEN
    IF NEW.oauth_refresh_token_secret_id IS NULL OR NEW.oauth_email IS NULL THEN
      RAISE EXCEPTION '% transport requires oauth_refresh_token_secret_id and oauth_email', NEW.transport;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;