
DO $$
DECLARE
  v_branch uuid := 'f691ce51-5ad1-40ab-9713-49322ae5b68d';
  v_user   uuid := 'f74552c1-6ab8-4e45-84c1-2665f9f9c087';
  v_order_ids uuid[];
  v_quote_ids uuid[];
  t text;
  child_tables text[] := ARRAY[
    'order_items','order_documents','order_addresses','order_adjustments',
    'order_jobs','order_invoices','order_payment_attempts','order_pricing_snapshots',
    'order_legal_acceptances','payments','timeline_events','status_history',
    'messages','job_proofs','job_events','jobs'
  ];
BEGIN
  SELECT array_agg(id) INTO v_order_ids FROM public.orders WHERE branch_id = v_branch;

  IF v_order_ids IS NOT NULL THEN
    SELECT array_agg(id) INTO v_quote_ids
      FROM public.quotes
     WHERE source_order_id = ANY(v_order_ids) OR converted_order_id = ANY(v_order_ids);
    IF v_quote_ids IS NOT NULL THEN
      DELETE FROM public.quote_documents WHERE quote_id = ANY(v_quote_ids);
      DELETE FROM public.quote_items     WHERE quote_id = ANY(v_quote_ids);
      DELETE FROM public.quote_revisions WHERE quote_id = ANY(v_quote_ids);
      DELETE FROM public.quotes          WHERE id       = ANY(v_quote_ids);
    END IF;

    FOREACH t IN ARRAY child_tables LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=t AND column_name='order_id'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE order_id = ANY($1)', t) USING v_order_ids;
      END IF;
    END LOOP;

    DELETE FROM public.orders WHERE id = ANY(v_order_ids);
  END IF;

  DELETE FROM public.quotes WHERE branch_id = v_branch;
  DELETE FROM public.branches WHERE id = v_branch;

  DELETE FROM public.tenant_memberships     WHERE profile_id = v_user;
  DELETE FROM public.user_roles             WHERE user_id    = v_user;
  DELETE FROM public.impersonation_sessions WHERE actor_profile_id = v_user OR target_profile_id = v_user;
  DELETE FROM public.platform_onboarding_tokens
    WHERE profile_id = v_user OR lower(email) = 'james_b_hawkins@icloud.com';
  DELETE FROM public.platform_email_campaign_recipients
    WHERE lower(email) = 'james_b_hawkins@icloud.com';

  DELETE FROM public.profiles WHERE id = v_user;
  DELETE FROM auth.users     WHERE id = v_user;
END $$;
