CREATE OR REPLACE FUNCTION public.create_email_account_secret(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := vault.create_secret(p_secret, p_name);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_account_secret(p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email_account_secret(p_secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_email_account_secret(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_account_secret(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email_account_secret(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_email_account_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_account_secret(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email_account_secret(uuid) TO service_role;