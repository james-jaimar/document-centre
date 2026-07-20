
-- 1) Harden entitlement RPC — NULL status must not skip the trialing branch.
CREATE OR REPLACE FUNCTION public.resolve_branch_entitlement(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub record;
  br_closed_at timestamptz;
  br_found boolean;
  now_ts timestamptz := now();
BEGIN
  SELECT storefront_closed_at INTO br_closed_at FROM public.branches WHERE id = _branch_id;
  br_found := FOUND;
  IF NOT br_found THEN
    RETURN jsonb_build_object('state','restricted','reason','branch_not_found');
  END IF;
  IF br_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','cancelled','reason','storefront_closed','until', br_closed_at);
  END IF;

  SELECT * INTO sub FROM public.branch_subscriptions WHERE branch_id = _branch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','restricted','reason','no_subscription');
  END IF;

  IF sub.comp_until IS NOT NULL AND sub.comp_until > now_ts THEN
    RETURN jsonb_build_object('state','active','reason','comp','until', sub.comp_until);
  END IF;

  IF sub.status IN ('cancelled','canceled') THEN
    RETURN jsonb_build_object('state','cancelled','reason','subscription_cancelled','until', sub.cancelled_at);
  END IF;

  -- Trial: valid while trial_ends_at is in the future. Use COALESCE so a NULL
  -- status (common on the 14-day no-card path) doesn't cause NOT IN to
  -- evaluate to NULL and skip this branch.
  IF sub.trial_ends_at IS NOT NULL
     AND sub.trial_ends_at > now_ts
     AND COALESCE(sub.status, '') <> 'active' THEN
    RETURN jsonb_build_object('state','trialing','until', sub.trial_ends_at);
  END IF;

  -- Expired no-card trial (no Stripe sub took over).
  IF sub.trial_ends_at IS NOT NULL
     AND sub.trial_ends_at <= now_ts
     AND sub.stripe_subscription_id IS NULL
     AND COALESCE(sub.status, '') <> 'active' THEN
    RETURN jsonb_build_object('state','restricted','reason','trial_expired','until', sub.trial_ends_at);
  END IF;

  IF sub.status = 'past_due' THEN
    IF sub.grace_until IS NOT NULL AND sub.grace_until > now_ts THEN
      RETURN jsonb_build_object('state','grace','reason','payment_failed','until', sub.grace_until);
    END IF;
    RETURN jsonb_build_object('state','restricted','reason','payment_failed_grace_expired','until', sub.grace_until);
  END IF;

  IF sub.status = 'active' OR sub.billing_status IN ('paid','free') THEN
    RETURN jsonb_build_object('state','active','until', sub.current_period_end);
  END IF;

  RETURN jsonb_build_object('state','restricted','reason', COALESCE(sub.status, sub.billing_status, 'unknown'));
END;
$$;

-- 2) start_branch_trial now also stamps status='trialing' so downstream
--    consumers (and the pre-fix RPC path) resolve cleanly.
CREATE OR REPLACE FUNCTION public.start_branch_trial(_branch_id uuid)
RETURNS public.branch_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.branch_subscriptions;
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = _branch_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  INSERT INTO public.branch_subscriptions (branch_id, tenant_id, trial_days, trial_status)
  VALUES (_branch_id, v_tenant_id, 14, 'not_started')
  ON CONFLICT (branch_id) DO NOTHING;

  UPDATE public.branch_subscriptions
  SET trial_started_at = now(),
      trial_ends_at = now() + interval '14 days',
      trial_status = 'active',
      status = 'trialing',
      updated_at = now()
  WHERE branch_id = _branch_id
    AND trial_started_at IS NULL
    AND trial_status = 'not_started'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.branch_subscriptions WHERE branch_id = _branch_id;
  END IF;

  RETURN v_row;
END;
$$;

-- 3) Backfill existing rows currently in an active trial window with NULL status.
UPDATE public.branch_subscriptions
SET status = 'trialing',
    updated_at = now()
WHERE status IS NULL
  AND trial_status = 'active'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at > now();
