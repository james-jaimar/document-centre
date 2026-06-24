-- Comp the internal "Postnet Test Branch" subscription so it can be used
-- indefinitely for demos / regression testing without burning a paid seat.
-- comp_until far in the future is honoured by resolve_branch_entitlement,
-- which short-circuits to state='active' whenever comp_until > now().
DO $$
DECLARE
  _branch_id uuid;
BEGIN
  SELECT id INTO _branch_id
  FROM public.branches
  WHERE lower(name) LIKE '%postnet test branch%'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF _branch_id IS NULL THEN
    RAISE NOTICE '[comp-test-branch] No branch matching "Postnet Test Branch" — skipping.';
    RETURN;
  END IF;

  INSERT INTO public.branch_subscriptions (branch_id, tenant_id, plan_slug, status, billing_status)
  SELECT _branch_id, b.tenant_id, 'free', 'active', 'free'
  FROM public.branches b
  WHERE b.id = _branch_id
  ON CONFLICT (branch_id) DO NOTHING;

  UPDATE public.branch_subscriptions
  SET comp_until = '2099-12-31T23:59:59Z'::timestamptz,
      override_reason = 'Internal test/demo branch — permanent comp granted by platform.',
      updated_at = now()
  WHERE branch_id = _branch_id;

  RAISE NOTICE '[comp-test-branch] Comped branch %', _branch_id;
END
$$;