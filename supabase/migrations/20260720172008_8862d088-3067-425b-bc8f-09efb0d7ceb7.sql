REVOKE EXECUTE ON FUNCTION public.enforce_email_account_scope() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_email_account_scope() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_email_outbox_account_scope() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_email_outbox_account_scope() FROM authenticated;