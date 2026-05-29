
-- Tenant-level subscription assignment
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS assigned_plan_slug text,
  ADD COLUMN IF NOT EXISTS assigned_region_id uuid REFERENCES public.platform_pricing_regions(id),
  ADD COLUMN IF NOT EXISTS assigned_discount_type text,
  ADD COLUMN IF NOT EXISTS assigned_discount_value numeric,
  ADD COLUMN IF NOT EXISTS assigned_trial_days integer,
  ADD COLUMN IF NOT EXISTS billing_notes text,
  ADD COLUMN IF NOT EXISTS plan_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_assigned_by uuid;

-- Apply tenant's assigned plan to every active branch
CREATE OR REPLACE FUNCTION public.apply_tenant_plan_to_branches(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_t record;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_tenant_admin(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to apply tenant plan';
  END IF;

  SELECT assigned_plan_slug, assigned_region_id, assigned_discount_type,
         assigned_discount_value, assigned_trial_days
  INTO v_t
  FROM public.tenants WHERE id = p_tenant_id;

  IF v_t.assigned_plan_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant has no assigned plan';
  END IF;

  WITH up AS (
    INSERT INTO public.branch_subscriptions
      (branch_id, tenant_id, region_id, assigned_plan_slug, assigned_at, assigned_by,
       discount_type, discount_value, trial_days, billing_status)
    SELECT b.id, b.tenant_id, v_t.assigned_region_id, v_t.assigned_plan_slug, now(), auth.uid(),
           v_t.assigned_discount_type, v_t.assigned_discount_value, v_t.assigned_trial_days,
           'pending_payment'
    FROM public.branches b
    WHERE b.tenant_id = p_tenant_id AND b.is_active = true
    ON CONFLICT (branch_id) DO UPDATE SET
      assigned_plan_slug = EXCLUDED.assigned_plan_slug,
      region_id = EXCLUDED.region_id,
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      trial_days = EXCLUDED.trial_days,
      assigned_at = now(),
      assigned_by = auth.uid(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM up;

  UPDATE public.tenants
  SET plan_assigned_at = now(), plan_assigned_by = auth.uid()
  WHERE id = p_tenant_id;

  RETURN v_count;
END;
$$;

-- Ensure unique branch_id for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_subscriptions_branch_id_key'
  ) THEN
    ALTER TABLE public.branch_subscriptions ADD CONSTRAINT branch_subscriptions_branch_id_key UNIQUE (branch_id);
  END IF;
END $$;

-- Auto-seed sub on new active branch when tenant has assigned plan
CREATE OR REPLACE FUNCTION public.seed_branch_subscription_from_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT assigned_plan_slug, assigned_region_id, assigned_discount_type,
         assigned_discount_value, assigned_trial_days
  INTO v_t FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_t.assigned_plan_slug IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.branch_subscriptions
    (branch_id, tenant_id, region_id, assigned_plan_slug, assigned_at,
     discount_type, discount_value, trial_days, billing_status)
  VALUES
    (NEW.id, NEW.tenant_id, v_t.assigned_region_id, v_t.assigned_plan_slug, now(),
     v_t.assigned_discount_type, v_t.assigned_discount_value, v_t.assigned_trial_days,
     'pending_payment')
  ON CONFLICT (branch_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_branch_subscription ON public.branches;
CREATE TRIGGER trg_seed_branch_subscription
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.seed_branch_subscription_from_tenant();
