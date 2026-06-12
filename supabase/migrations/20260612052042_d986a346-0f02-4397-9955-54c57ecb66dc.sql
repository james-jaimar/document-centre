DELETE FROM public.email_accounts
WHERE tenant_id IS NULL
  AND branch_id IS NULL
  AND transport = 'graph';