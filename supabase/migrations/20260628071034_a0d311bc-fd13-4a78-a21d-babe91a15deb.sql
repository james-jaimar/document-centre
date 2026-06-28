
-- 1) impersonation_sessions
CREATE TABLE public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NULL,
  branch_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  ended_reason text NULL,
  ip text NULL,
  user_agent text NULL,
  actions_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX impersonation_sessions_actor_idx ON public.impersonation_sessions(actor_profile_id, started_at DESC);
CREATE INDEX impersonation_sessions_target_idx ON public.impersonation_sessions(target_profile_id, started_at DESC);
CREATE INDEX impersonation_sessions_tenant_idx ON public.impersonation_sessions(tenant_id, started_at DESC);

GRANT SELECT ON public.impersonation_sessions TO authenticated;
GRANT ALL ON public.impersonation_sessions TO service_role;
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Platform admins can see everything; actors can see their own rows;
-- tenant owners/admins can see rows for their tenant.
CREATE POLICY "imp_sessions_actor_select" ON public.impersonation_sessions
  FOR SELECT TO authenticated
  USING (
    actor_profile_id = auth.uid()
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR (tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.tenant_id = impersonation_sessions.tenant_id
        AND m.is_active
        AND m.role IN ('owner','admin')
    ))
  );

-- 2) Tag rows with the staff member responsible.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS impersonated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_under_impersonation_id uuid NULL REFERENCES public.impersonation_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS impersonated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS impersonated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3) Helper used by the edge function (defence in depth alongside service-role checks).
CREATE OR REPLACE FUNCTION public.caller_can_impersonate(_target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_target_staff boolean;
  is_target_platform_admin boolean;
  target_tenant uuid;
  target_branches uuid[];
BEGIN
  IF auth.uid() IS NULL OR _target IS NULL OR _target = auth.uid() THEN
    RETURN false;
  END IF;

  -- Never impersonate platform admins or any staff (non-customer membership).
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'platform_admin'::app_role
  ) INTO is_target_platform_admin;
  IF is_target_platform_admin THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = _target AND is_active AND role <> 'customer'
  ) INTO is_target_staff;
  IF is_target_staff THEN RETURN false; END IF;

  -- Platform admin can impersonate any customer.
  IF public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Tenant owner/admin can impersonate any customer in their tenant.
  IF EXISTS (
    SELECT 1 FROM public.tenant_memberships caller
    JOIN public.tenant_memberships target_m
      ON target_m.tenant_id = caller.tenant_id
     AND target_m.app_id = caller.app_id
    WHERE caller.profile_id = auth.uid()
      AND caller.is_active
      AND caller.role IN ('owner','admin')
      AND target_m.profile_id = _target
      AND target_m.is_active
      AND target_m.role = 'customer'
  ) THEN
    RETURN true;
  END IF;

  -- Branch staff: target must be tied to one of their branches via membership
  -- OR have ordered at one of their branches.
  SELECT array_agg(branch_id) INTO target_branches
  FROM public.tenant_memberships
  WHERE profile_id = auth.uid() AND is_active AND branch_id IS NOT NULL
    AND role IN ('owner','admin','branch_manager','store_operator','sales','production','accounts');

  IF target_branches IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = _target
      AND is_active
      AND role = 'customer'
      AND branch_id = ANY(target_branches)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE ordered_by_profile_id = _target
      AND branch_id = ANY(target_branches)
      AND order_status <> 'cart'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 4) Include branch-tagged customer memberships in branch customer list.
CREATE OR REPLACE FUNCTION public.get_branch_customers(_branch_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, first_name text, last_name text, email text, phone text, order_count bigint, total_spent numeric, last_order_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.caller_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for branch %', _branch_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH order_stats AS (
    SELECT
      o.ordered_by_profile_id AS profile_id,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(o.total_amount), 0)::numeric AS total_spent,
      MAX(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE o.branch_id = _branch_id
      AND o.order_status <> 'cart'
      AND o.ordered_by_profile_id IS NOT NULL
    GROUP BY o.ordered_by_profile_id
  ),
  quote_profiles AS (
    SELECT DISTINCT q.created_by_profile_id AS profile_id
    FROM public.quotes q
    WHERE q.branch_id = _branch_id
      AND q.created_by_profile_id IS NOT NULL
  ),
  membership_profiles AS (
    SELECT DISTINCT m.profile_id
    FROM public.tenant_memberships m
    WHERE m.branch_id = _branch_id
      AND m.is_active
      AND m.role = 'customer'
  ),
  all_profiles AS (
    SELECT profile_id FROM order_stats
    UNION
    SELECT profile_id FROM quote_profiles
    UNION
    SELECT profile_id FROM membership_profiles
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    COALESCE(os.order_count, 0)::bigint,
    COALESCE(os.total_spent, 0)::numeric,
    os.last_order_at
  FROM all_profiles ap
  JOIN public.profiles p ON p.id = ap.profile_id
  LEFT JOIN order_stats os ON os.profile_id = ap.profile_id
  ORDER BY os.last_order_at DESC NULLS LAST, p.display_name ASC NULLS LAST;
END;
$function$;
