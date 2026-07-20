REVOKE ALL ON FUNCTION public.enforce_email_account_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_email_outbox_account_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_email_account_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_email_outbox_account_scope() TO service_role;