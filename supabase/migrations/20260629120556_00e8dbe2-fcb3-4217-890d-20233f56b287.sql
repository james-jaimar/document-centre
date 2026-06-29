
-- 1. Add new step columns + pricing reviewed timestamp
ALTER TABLE public.branch_onboarding_progress
  ADD COLUMN IF NOT EXISTS banking_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_reviewed_at timestamptz;

-- 2. Rewrite recompute to use the correct tables (email_accounts, branch_payment_gateways)
--    and include banking + pricing review signals.
CREATE OR REPLACE FUNCTION public.recompute_branch_onboarding(_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_company boolean := false;
  v_banking boolean := false;
  v_pricing boolean := false;
  v_email boolean := false;
  v_payfast boolean := false;
  v_team boolean := false;
  v_order boolean := false;
  v_required_all boolean;
  v_existing_reviewed boolean;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = _branch_id;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- Company details: trading name + address + phone
  SELECT (COALESCE(NULLIF(trim(coalesce(trading_name, name, '')), ''), '') <> ''
          AND COALESCE(NULLIF(trim(coalesce(address, '')), ''), '') <> ''
          AND COALESCE(NULLIF(trim(coalesce(phone, '')), ''), '') <> '')
  INTO v_company FROM public.branches WHERE id = _branch_id;

  -- Banking: branch_private.banking_details has any non-empty bank + account
  BEGIN
    SELECT (
      bp.banking_details IS NOT NULL
      AND COALESCE(NULLIF(trim(bp.banking_details->>'bank_name'), ''), '') <> ''
      AND COALESCE(NULLIF(trim(bp.banking_details->>'account_number'), ''), '') <> ''
    )
    INTO v_banking
    FROM public.branch_private bp WHERE bp.branch_id = _branch_id;
  EXCEPTION WHEN OTHERS THEN v_banking := false;
  END;

  -- Pricing reviewed: previously persisted timestamp
  SELECT (pricing_reviewed_at IS NOT NULL) INTO v_existing_reviewed
  FROM public.branch_onboarding_progress WHERE branch_id = _branch_id;
  v_pricing := COALESCE(v_existing_reviewed, false);

  -- Email settings: any active email_accounts row for this branch
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.email_accounts
      WHERE branch_id = _branch_id AND is_active = true
    ) INTO v_email;
  EXCEPTION WHEN OTHERS THEN v_email := false;
  END;

  -- Payments: any enabled branch_payment_gateway (optional step)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.branch_payment_gateways
      WHERE branch_id = _branch_id AND is_enabled = true
    ) INTO v_payfast;
  EXCEPTION WHEN OTHERS THEN v_payfast := false;
  END;

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

  -- Required steps for "complete": everything EXCEPT optional payments.
  v_required_all := v_company AND v_banking AND v_pricing AND v_email AND v_team AND v_order;

  INSERT INTO public.branch_onboarding_progress
    (branch_id, tenant_id, company_details_done, banking_done, pricing_reviewed,
     email_settings_done, branding_done, payfast_done, team_invited, first_order_done,
     completed_at)
  VALUES (_branch_id, v_tenant_id,
          COALESCE(v_company,false), COALESCE(v_banking,false), COALESCE(v_pricing,false),
          COALESCE(v_email,false), true, COALESCE(v_payfast,false),
          COALESCE(v_team,false), COALESCE(v_order,false),
          CASE WHEN v_required_all THEN now() ELSE NULL END)
  ON CONFLICT (branch_id) DO UPDATE SET
    company_details_done = EXCLUDED.company_details_done,
    banking_done         = EXCLUDED.banking_done,
    pricing_reviewed     = EXCLUDED.pricing_reviewed,
    email_settings_done  = EXCLUDED.email_settings_done,
    payfast_done         = EXCLUDED.payfast_done,
    team_invited         = EXCLUDED.team_invited,
    first_order_done     = EXCLUDED.first_order_done,
    completed_at         = CASE WHEN v_required_all AND branch_onboarding_progress.completed_at IS NULL THEN now()
                                WHEN v_required_all THEN branch_onboarding_progress.completed_at
                                ELSE NULL END,
    updated_at = now();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'recompute_branch_onboarding error: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_branch_onboarding(uuid) TO authenticated, service_role;

-- 3. Mark pricing reviewed RPC (called from the pricing page button)
CREATE OR REPLACE FUNCTION public.mark_branch_pricing_reviewed(_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = _branch_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;

  -- Permission: caller must be tenant owner/admin or this branch's manager
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = v_tenant_id
      AND tm.is_active = true
      AND (tm.role IN ('owner','admin')
           OR (tm.role = 'branch_manager' AND tm.branch_id = _branch_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.branch_onboarding_progress (branch_id, tenant_id, pricing_reviewed, pricing_reviewed_at)
  VALUES (_branch_id, v_tenant_id, true, now())
  ON CONFLICT (branch_id) DO UPDATE SET
    pricing_reviewed = true,
    pricing_reviewed_at = COALESCE(branch_onboarding_progress.pricing_reviewed_at, now()),
    updated_at = now();

  PERFORM public.recompute_branch_onboarding(_branch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_branch_pricing_reviewed(uuid) TO authenticated, service_role;

-- 4. Reset Demo3 subscription to a clean "no trial yet" state so the trial picker shows.
UPDATE public.branch_subscriptions
SET trial_started_at = NULL,
    trial_ends_at = NULL,
    trial_status = 'not_started',
    trial_started_via = NULL,
    stripe_subscription_id = NULL,
    billing_status = 'pending_payment',
    status = 'incomplete',
    updated_at = now()
WHERE branch_id = '0aa85e46-1eec-429e-ba36-65fa6150ca45';
