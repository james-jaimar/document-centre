-- Stash the M365 Graph client secret in Vault and create the email_accounts row.
DO $$
DECLARE
  v_tenant_id uuid := '72347b5f-ca94-4e25-9235-5bd2e554beeb';  -- Document Centre Demo
  v_secret_id uuid;
  v_account_id uuid;
BEGIN
  -- Create (or reuse) the vault secret. vault.create_secret raises on duplicate name,
  -- so look it up first.
  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = 'document-centre-m365-graph-client-secret';

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      'ku_8Q~iUgbODrav5R~vy3jLzuzBCEGz2R6Gdia0b',
      'document-centre-m365-graph-client-secret'
    );
  ELSE
    -- Refresh the secret in case it changed
    UPDATE vault.secrets
    SET secret = 'ku_8Q~iUgbODrav5R~vy3jLzuzBCEGz2R6Gdia0b'
    WHERE id = v_secret_id;
  END IF;

  -- Upsert the Graph email account for this tenant.
  SELECT id INTO v_account_id
  FROM public.email_accounts
  WHERE tenant_id = v_tenant_id
    AND transport = 'graph'
    AND graph_sender_address = 'hello@document-centre.com';

  IF v_account_id IS NULL THEN
    INSERT INTO public.email_accounts (
      tenant_id, label,
      transport,
      graph_tenant_id, graph_client_id, graph_client_secret_id, graph_sender_address,
      from_name, from_email, reply_to,
      smtp_host, smtp_port, smtp_secure, smtp_username,  -- nullable for graph rows
      is_default, is_active, send_delay_ms, max_concurrent
    ) VALUES (
      v_tenant_id, 'Document Centre (M365 Graph)',
      'graph',
      '57593206-dca7-4402-84ac-a17dee9ec009',
      '3e82c1f8-a79a-40c8-beb3-1929840d890f',
      v_secret_id,
      'hello@document-centre.com',
      'Document Centre', 'hello@document-centre.com', NULL,
      NULL, NULL, NULL, NULL,
      true, true, 500, 4
    );
  ELSE
    UPDATE public.email_accounts
    SET
      graph_tenant_id = '57593206-dca7-4402-84ac-a17dee9ec009',
      graph_client_id = '3e82c1f8-a79a-40c8-beb3-1929840d890f',
      graph_client_secret_id = v_secret_id,
      graph_sender_address = 'hello@document-centre.com',
      from_name = 'Document Centre',
      from_email = 'hello@document-centre.com',
      is_default = true,
      is_active = true,
      last_error = NULL
    WHERE id = v_account_id;
  END IF;

  -- Make sure no other account on this tenant claims default
  UPDATE public.email_accounts
  SET is_default = false
  WHERE tenant_id = v_tenant_id
    AND id <> COALESCE(v_account_id, (SELECT id FROM public.email_accounts WHERE tenant_id = v_tenant_id AND transport = 'graph' LIMIT 1));
END $$;

-- Reset any stuck test outbox row so the new dispatcher path picks it up.
-- Point any unsent rows for hello@/the demo tenant at the new account.
UPDATE public.email_outbox
SET
  status = 'queued',
  email_account_id = (
    SELECT id FROM public.email_accounts
    WHERE tenant_id = '72347b5f-ca94-4e25-9235-5bd2e554beeb'
      AND transport = 'graph'
    LIMIT 1
  ),
  next_attempt_at = now(),
  locked_at = NULL,
  locked_by = NULL,
  error_message = NULL
WHERE status IN ('sending', 'failed')
  AND (
    tenant_id = '72347b5f-ca94-4e25-9235-5bd2e554beeb'
    OR from_email = 'hello@document-centre.com'
    OR to_email = 'hello@document-centre.com'
  )
  AND sent_at IS NULL;