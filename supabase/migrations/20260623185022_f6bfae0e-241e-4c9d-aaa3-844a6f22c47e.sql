
ALTER TABLE public.branch_subscriptions
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS storefront_closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_branches_storefront_closed_at
  ON public.branches (storefront_closed_at)
  WHERE storefront_closed_at IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_branch_entitlement(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub record;
  br record;
  now_ts timestamptz := now();
BEGIN
  SELECT storefront_closed_at INTO br FROM public.branches WHERE id = _branch_id;
  IF br IS NULL THEN
    RETURN jsonb_build_object('state','restricted','reason','branch_not_found');
  END IF;
  IF br.storefront_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','cancelled','reason','storefront_closed','until', br.storefront_closed_at);
  END IF;

  SELECT * INTO sub FROM public.branch_subscriptions WHERE branch_id = _branch_id;
  IF sub IS NULL THEN
    RETURN jsonb_build_object('state','restricted','reason','no_subscription');
  END IF;

  IF sub.status IN ('cancelled','canceled') THEN
    RETURN jsonb_build_object('state','cancelled','reason','subscription_cancelled','until', sub.cancelled_at);
  END IF;

  IF sub.status = 'trialing' OR (sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > now_ts AND sub.status NOT IN ('active')) THEN
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

GRANT EXECUTE ON FUNCTION public.resolve_branch_entitlement(uuid) TO anon, authenticated, service_role;
