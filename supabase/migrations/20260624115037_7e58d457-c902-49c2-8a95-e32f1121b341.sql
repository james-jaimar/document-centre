-- 1) Repair resolve_branch_entitlement. The previous version used
--    `SELECT col INTO rec; IF rec IS NULL` which evaluates true when every
--    selected column is NULL — so any branch with storefront_closed_at NULL
--    (essentially all of them) was wrongly reported as branch_not_found and
--    the gate locked it to "restricted / read-only".
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
  SELECT storefront_closed_at INTO br_closed_at
  FROM public.branches
  WHERE id = _branch_id;
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

  -- Comp window: platform-granted free access overrides everything except
  -- outright cancellation/closure.
  IF sub.comp_until IS NOT NULL AND sub.comp_until > now_ts THEN
    RETURN jsonb_build_object('state','active','reason','comp','until', sub.comp_until);
  END IF;

  IF sub.status IN ('cancelled','canceled') THEN
    RETURN jsonb_build_object('state','cancelled','reason','subscription_cancelled','until', sub.cancelled_at);
  END IF;

  IF sub.status = 'trialing'
     OR (sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > now_ts AND sub.status NOT IN ('active')) THEN
    RETURN jsonb_build_object('state','trialing','until', sub.trial_ends_at);
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