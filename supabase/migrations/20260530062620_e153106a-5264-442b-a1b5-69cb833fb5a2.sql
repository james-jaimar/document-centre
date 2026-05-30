-- 1. Widen gate: branch is active if branch row says so, OR tenant_subscriptions says so, OR tenant is demo.
CREATE OR REPLACE FUNCTION public.branch_subscription_active(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN p_branch_id IS NULL THEN true
      ELSE (
        -- Branch-level row says active
        EXISTS (
          SELECT 1 FROM public.branch_subscriptions bs
          WHERE bs.branch_id = p_branch_id
            AND (
              bs.status IN ('active','trialing')
              OR bs.billing_status IN ('paid','free')
            )
        )
        -- Or tenant-level subscription says active/free/paid
        OR EXISTS (
          SELECT 1
          FROM public.branches b
          JOIN public.tenant_subscriptions ts ON ts.tenant_id = b.tenant_id
          WHERE b.id = p_branch_id
            AND (
              ts.status IN ('active','trialing')
              OR ts.billing_status IN ('paid','free')
            )
        )
        -- Or tenant is a demo tenant
        OR EXISTS (
          SELECT 1 FROM public.branches b
          JOIN public.tenants t ON t.id = b.tenant_id
          WHERE b.id = p_branch_id AND t.is_demo = true
        )
      )
    END;
$function$;

-- 2. Cascade trigger: when tenant_subscriptions changes, sync all branches.
CREATE OR REPLACE FUNCTION public.cascade_tenant_subscription_to_branches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_unlocked boolean;
BEGIN
  v_unlocked := (NEW.status IN ('active','trialing'))
                OR (NEW.billing_status IN ('paid','free'));

  -- Upsert one branch_subscriptions row per active branch
  INSERT INTO public.branch_subscriptions
    (branch_id, tenant_id, assigned_plan_slug, plan_slug, status, billing_status)
  SELECT b.id, b.tenant_id, NEW.plan_slug, NEW.plan_slug,
         CASE WHEN v_unlocked THEN COALESCE(NEW.status, 'active') ELSE NEW.status END,
         NEW.billing_status
  FROM public.branches b
  WHERE b.tenant_id = NEW.tenant_id AND b.is_active = true
  ON CONFLICT (branch_id) DO UPDATE
    SET status = EXCLUDED.status,
        billing_status = EXCLUDED.billing_status,
        assigned_plan_slug = COALESCE(EXCLUDED.assigned_plan_slug, public.branch_subscriptions.assigned_plan_slug),
        plan_slug = COALESCE(EXCLUDED.plan_slug, public.branch_subscriptions.plan_slug),
        updated_at = now();

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cascade_tenant_subscription ON public.tenant_subscriptions;
CREATE TRIGGER trg_cascade_tenant_subscription
AFTER INSERT OR UPDATE ON public.tenant_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.cascade_tenant_subscription_to_branches();

-- 3. Backfill: for every existing tenant_subscriptions row, cascade now.
INSERT INTO public.branch_subscriptions
  (branch_id, tenant_id, assigned_plan_slug, plan_slug, status, billing_status)
SELECT b.id, b.tenant_id, ts.plan_slug, ts.plan_slug,
       COALESCE(ts.status, 'active'),
       COALESCE(ts.billing_status, 'free')
FROM public.tenant_subscriptions ts
JOIN public.branches b ON b.tenant_id = ts.tenant_id AND b.is_active = true
WHERE ts.status IN ('active','trialing')
   OR ts.billing_status IN ('paid','free')
ON CONFLICT (branch_id) DO UPDATE
  SET status = EXCLUDED.status,
      billing_status = EXCLUDED.billing_status,
      assigned_plan_slug = COALESCE(EXCLUDED.assigned_plan_slug, public.branch_subscriptions.assigned_plan_slug),
      plan_slug = COALESCE(EXCLUDED.plan_slug, public.branch_subscriptions.plan_slug),
      updated_at = now();