
-- 1. Update ZA postnet plan to R499 with new Stripe price
UPDATE public.platform_pricing_plans
SET price = 499.00,
    stripe_price_id = 'price_1TcUWOLiJIHImIL1hqE4Yiik',
    updated_at = now()
WHERE plan_slug = 'postnet'
  AND region_id = '40f6dd7a-93fc-4da2-b354-a261371de3c6';

-- 2. Add trial tracking columns to branch_subscriptions
ALTER TABLE public.branch_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_status text NOT NULL DEFAULT 'not_started';

-- Backfill trial_status for existing rows
UPDATE public.branch_subscriptions
SET trial_status = CASE
  WHEN status = 'active' OR billing_status IN ('paid','free') THEN 'converted'
  WHEN trial_ends_at IS NOT NULL AND trial_ends_at < now() THEN 'expired'
  WHEN trial_ends_at IS NOT NULL THEN 'active'
  ELSE 'not_started'
END
WHERE trial_status IS NULL OR trial_status = 'not_started';

-- 3. Branch onboarding progress table
CREATE TABLE IF NOT EXISTS public.branch_onboarding_progress (
  branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_details_done boolean NOT NULL DEFAULT false,
  email_settings_done boolean NOT NULL DEFAULT false,
  branding_done boolean NOT NULL DEFAULT false,
  payfast_done boolean NOT NULL DEFAULT false,
  team_invited boolean NOT NULL DEFAULT false,
  first_order_done boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.branch_onboarding_progress TO authenticated;
GRANT ALL ON public.branch_onboarding_progress TO service_role;

ALTER TABLE public.branch_onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Tenant owners/admins can manage all branches in their tenant; branch managers their own branch
CREATE POLICY "Tenant admins manage branch onboarding"
ON public.branch_onboarding_progress FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branch_onboarding_progress.tenant_id
      AND tm.is_active = true
      AND (tm.role IN ('owner','admin')
        OR (tm.role = 'branch_manager' AND tm.branch_id = branch_onboarding_progress.branch_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branch_onboarding_progress.tenant_id
      AND tm.is_active = true
      AND (tm.role IN ('owner','admin')
        OR (tm.role = 'branch_manager' AND tm.branch_id = branch_onboarding_progress.branch_id))
  )
);

CREATE TRIGGER trg_branch_onboarding_updated
BEFORE UPDATE ON public.branch_onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Recompute helper — auto-detect each step's done status
CREATE OR REPLACE FUNCTION public.recompute_branch_onboarding(_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_company boolean;
  v_email boolean;
  v_branding boolean;
  v_payfast boolean;
  v_team boolean;
  v_order boolean;
  v_all boolean;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = _branch_id;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- Company details: trading name + address present on branch
  SELECT (COALESCE(NULLIF(trim(coalesce(trading_name, name)), ''), '') <> ''
          AND COALESCE(NULLIF(trim(coalesce(address_line1, '')), ''), '') <> '')
  INTO v_company FROM public.branches WHERE id = _branch_id;

  -- Email settings: any email account row for this branch
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_email_accounts
    WHERE branch_id = _branch_id AND is_active = true
  ) INTO v_email;

  -- Branding: branch has logo_url
  SELECT (COALESCE(NULLIF(trim(coalesce(logo_url, '')), ''), '') <> '')
  INTO v_branding FROM public.branches WHERE id = _branch_id;

  -- PayFast: any payment_gateway row scoped to branch with provider payfast
  SELECT EXISTS (
    SELECT 1 FROM public.payment_gateways
    WHERE branch_id = _branch_id AND provider = 'payfast' AND enabled = true
  ) INTO v_payfast;

  -- Team: more than one active member at this branch
  SELECT (count(*) >= 2) INTO v_team
  FROM public.tenant_memberships
  WHERE branch_id = _branch_id AND is_active = true;

  -- First order: any non-cart, non-draft order
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE branch_id = _branch_id
      AND order_status NOT IN ('cart','draft')
  ) INTO v_order;

  v_all := v_company AND v_email AND v_branding AND v_payfast AND v_team AND v_order;

  INSERT INTO public.branch_onboarding_progress
    (branch_id, tenant_id, company_details_done, email_settings_done, branding_done,
     payfast_done, team_invited, first_order_done, completed_at)
  VALUES (_branch_id, v_tenant_id,
          COALESCE(v_company,false), COALESCE(v_email,false), COALESCE(v_branding,false),
          COALESCE(v_payfast,false), COALESCE(v_team,false), COALESCE(v_order,false),
          CASE WHEN v_all THEN now() ELSE NULL END)
  ON CONFLICT (branch_id) DO UPDATE SET
    company_details_done = EXCLUDED.company_details_done,
    email_settings_done  = EXCLUDED.email_settings_done,
    branding_done        = EXCLUDED.branding_done,
    payfast_done         = EXCLUDED.payfast_done,
    team_invited         = EXCLUDED.team_invited,
    first_order_done     = EXCLUDED.first_order_done,
    completed_at         = CASE WHEN v_all AND branch_onboarding_progress.completed_at IS NULL THEN now()
                                WHEN v_all THEN branch_onboarding_progress.completed_at
                                ELSE NULL END,
    updated_at = now();
EXCEPTION WHEN OTHERS THEN
  -- Swallow errors for tables that may not exist yet (payment_gateways/tenant_email_accounts)
  RAISE NOTICE 'recompute_branch_onboarding error: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_branch_onboarding(uuid) TO authenticated, service_role;

-- 5. Start trial helper (called by edge function)
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

  -- Ensure a subscription row exists
  INSERT INTO public.branch_subscriptions (branch_id, tenant_id, trial_days, trial_status)
  VALUES (_branch_id, v_tenant_id, 14, 'not_started')
  ON CONFLICT (branch_id) DO NOTHING;

  -- Start trial if not already started and not already converted
  UPDATE public.branch_subscriptions
  SET trial_started_at = now(),
      trial_ends_at = now() + interval '14 days',
      trial_status = 'active',
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

GRANT EXECUTE ON FUNCTION public.start_branch_trial(uuid) TO authenticated, service_role;

-- 6. Expire trials (called by daily cron)
CREATE OR REPLACE FUNCTION public.expire_branch_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.branch_subscriptions
    SET trial_status = 'expired',
        billing_status = COALESCE(NULLIF(billing_status,'paid'), 'pending_payment'),
        updated_at = now()
    WHERE trial_status = 'active'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now()
      AND (status IS NULL OR status NOT IN ('active','trialing'))
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_branch_trials() TO service_role;
