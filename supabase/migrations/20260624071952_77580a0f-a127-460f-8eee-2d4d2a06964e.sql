
-- 1. Extend branch_subscriptions with override fields
ALTER TABLE public.branch_subscriptions
  ADD COLUMN IF NOT EXISTS comp_until timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- 2. Update entitlement resolver to honour comp_until
CREATE OR REPLACE FUNCTION public.resolve_branch_entitlement(_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Comp window: platform admin granted free access, overrides everything except outright cancellation/closure
  IF sub.comp_until IS NOT NULL AND sub.comp_until > now_ts THEN
    RETURN jsonb_build_object('state','active','reason','comp','until', sub.comp_until);
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
$function$;

-- 3. Platform admin audit log
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email_snapshot text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  tenant_id uuid,
  branch_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admin_audit TO authenticated;
GRANT ALL ON public.platform_admin_audit TO service_role;

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view audit" ON public.platform_admin_audit;
CREATE POLICY "Platform admins can view audit"
ON public.platform_admin_audit
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'));

-- No insert/update/delete policies → only service role can write.

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_created_at ON public.platform_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_tenant ON public.platform_admin_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_branch ON public.platform_admin_audit (branch_id, created_at DESC);

-- 4. Cross-tenant branch subscription listing for platform dashboard
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
   created_at timestamptz,
   updated_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
    bs.created_at,
    bs.updated_at
  FROM public.branch_subscriptions bs
  JOIN public.branches b ON b.id = bs.branch_id
  JOIN public.tenants t ON t.id = bs.tenant_id
  ORDER BY bs.updated_at DESC;
END;
$$;

-- 5. Legal acceptance status per branch / document
CREATE OR REPLACE FUNCTION public.platform_legal_acceptance_status()
 RETURNS TABLE (
   branch_id uuid,
   branch_name text,
   tenant_id uuid,
   tenant_name text,
   doc_slug text,
   accepted_version integer,
   accepted_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      sa.branch_id,
      sa.doc_slug,
      sa.doc_version,
      sa.accepted_at,
      ROW_NUMBER() OVER (
        PARTITION BY sa.branch_id, sa.doc_slug
        ORDER BY sa.doc_version DESC, sa.accepted_at DESC
      ) AS rn
    FROM public.subscription_acceptances sa
    WHERE sa.branch_id IS NOT NULL
  )
  SELECT
    b.id,
    b.name,
    t.id,
    t.name,
    r.doc_slug,
    r.doc_version,
    r.accepted_at
  FROM ranked r
  JOIN public.branches b ON b.id = r.branch_id
  JOIN public.tenants t ON t.id = b.tenant_id
  WHERE r.rn = 1
  ORDER BY t.name, b.name, r.doc_slug;
END;
$$;
