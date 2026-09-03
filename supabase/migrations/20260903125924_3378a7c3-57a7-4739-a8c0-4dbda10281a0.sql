-- 1. Block tenant billing-column edits by non platform admins
CREATE OR REPLACE FUNCTION public.guard_tenant_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / internal jobs bypass (no auth.uid())
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_plan_slug IS DISTINCT FROM OLD.assigned_plan_slug
     OR NEW.assigned_region_id IS DISTINCT FROM OLD.assigned_region_id
     OR NEW.assigned_discount_type IS DISTINCT FROM OLD.assigned_discount_type
     OR NEW.assigned_discount_value IS DISTINCT FROM OLD.assigned_discount_value
     OR NEW.assigned_trial_days IS DISTINCT FROM OLD.assigned_trial_days
     OR NEW.billing_notes IS DISTINCT FROM OLD.billing_notes
     OR NEW.plan_slug IS DISTINCT FROM OLD.plan_slug THEN
    RAISE EXCEPTION 'Subscription plan terms can only be changed by Document Centre';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tenant_billing_columns ON public.tenants;
CREATE TRIGGER trg_guard_tenant_billing_columns
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_billing_columns();

-- 2. Branch subscription writes: platform admin only (edge functions use service_role)
CREATE OR REPLACE FUNCTION public.user_can_write_branch_subscription(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'platform_admin'::app_role);
$$;