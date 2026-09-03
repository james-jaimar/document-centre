ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_exempt_until timestamptz,
  ADD COLUMN IF NOT EXISTS billing_exempt_reason text;

-- Guard: tenant admins may not flip the exemption
CREATE OR REPLACE FUNCTION public.guard_tenant_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_plan_slug IS DISTINCT FROM OLD.assigned_plan_slug
     OR NEW.assigned_region_id IS DISTINCT FROM OLD.assigned_region_id
     OR NEW.assigned_discount_type IS DISTINCT FROM OLD.assigned_discount_type
     OR NEW.assigned_discount_value IS DISTINCT FROM OLD.assigned_discount_value
     OR NEW.assigned_trial_days IS DISTINCT FROM OLD.assigned_trial_days
     OR NEW.billing_notes IS DISTINCT FROM OLD.billing_notes
     OR NEW.plan_slug IS DISTINCT FROM OLD.plan_slug
     OR NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt
     OR NEW.billing_exempt_until IS DISTINCT FROM OLD.billing_exempt_until
     OR NEW.billing_exempt_reason IS DISTINCT FROM OLD.billing_exempt_reason THEN
    RAISE EXCEPTION 'Subscription plan terms can only be changed by Document Centre';
  END IF;

  RETURN NEW;
END;
$$;

-- Entitlement: tenant-wide exemption short-circuits to active
CREATE OR REPLACE FUNCTION public.resolve_branch_entitlement(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub record;
  br_closed_at timestamptz;
  br_tenant_id uuid;
  br_found boolean;
  ten record;
  now_ts timestamptz := now();
BEGIN
  SELECT storefront_closed_at, tenant_id INTO br_closed_at, br_tenant_id
  FROM public.branches WHERE id = _branch_id;
  br_found := FOUND;
  IF NOT br_found THEN
    RETURN jsonb_build_object('state','restricted','reason','branch_not_found');
  END IF;
  IF br_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','cancelled','reason','storefront_closed','until', br_closed_at);
  END IF;

  SELECT billing_exempt, billing_exempt_until INTO ten
  FROM public.tenants WHERE id = br_tenant_id;
  IF FOUND AND ten.billing_exempt
     AND (ten.billing_exempt_until IS NULL OR ten.billing_exempt_until > now_ts) THEN
    RETURN jsonb_build_object('state','active','reason','tenant_exempt','until', ten.billing_exempt_until);
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

  IF sub.trial_ends_at IS NOT NULL
     AND sub.trial_ends_at > now_ts
     AND COALESCE(sub.status, '') <> 'active' THEN
    RETURN jsonb_build_object('state','trialing','until', sub.trial_ends_at);
  END IF;

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

-- Platform list: surface tenant exemption
DROP FUNCTION IF EXISTS public.platform_list_branch_subscriptions();
CREATE OR REPLACE FUNCTION public.platform_list_branch_subscriptions()
RETURNS TABLE (
  subscription_id uuid,
  branch_id uuid,
  branch_name text,
  branch_slug text,
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  plan_slug text,
  assigned_plan_slug text,
  status text,
  billing_status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  comp_until timestamptz,
  cancelled_at timestamptz,
  storefront_closed_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  override_reason text,
  tenant_billing_exempt boolean,
  tenant_billing_exempt_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    bs.id,
    b.id,
    b.name,
    b.slug,
    t.id,
    t.name,
    t.slug,
    bs.plan_slug,
    bs.assigned_plan_slug,
    bs.status,
    bs.billing_status,
    bs.trial_ends_at,
    bs.current_period_end,
    bs.grace_until,
    bs.comp_until,
    bs.cancelled_at,
    b.storefront_closed_at,
    bs.stripe_subscription_id,
    bs.stripe_customer_id,
    bs.override_reason,
    t.billing_exempt,
    t.billing_exempt_until,
    bs.created_at,
    bs.updated_at
  FROM public.branch_subscriptions bs
  JOIN public.branches b ON b.id = bs.branch_id
  JOIN public.tenants t ON t.id = bs.tenant_id
  ORDER BY bs.updated_at DESC;
END;
$$;