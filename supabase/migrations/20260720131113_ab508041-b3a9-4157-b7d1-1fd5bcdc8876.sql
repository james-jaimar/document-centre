CREATE OR REPLACE FUNCTION public.set_branch_onboarding_step(_branch_id uuid, _step text, _done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _uid uuid := auth.uid();
  _allowed boolean;
  _sql text;
  _required_done int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _step NOT IN (
    'company_details_done','banking_done','pricing_reviewed',
    'email_settings_done','branding_done','payfast_done',
    'team_invited','first_order_done'
  ) THEN
    RAISE EXCEPTION 'Invalid step: %', _step;
  END IF;

  SELECT tenant_id INTO _tenant_id FROM public.branches WHERE id = _branch_id;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = _uid
      AND tenant_id = _tenant_id
      AND is_active = true
      AND role IN ('owner','admin','manager')
      AND (branch_id IS NULL OR branch_id = _branch_id)
  ) INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Not authorised for this branch';
  END IF;

  INSERT INTO public.branch_onboarding_progress (branch_id, tenant_id)
  VALUES (_branch_id, _tenant_id)
  ON CONFLICT (branch_id) DO NOTHING;

  _sql := format('UPDATE public.branch_onboarding_progress SET %I = $1 WHERE branch_id = $2', _step);
  EXECUTE _sql USING _done, _branch_id;

  SELECT
    (CASE WHEN company_details_done THEN 1 ELSE 0 END
   + CASE WHEN banking_done THEN 1 ELSE 0 END
   + CASE WHEN pricing_reviewed THEN 1 ELSE 0 END
   + CASE WHEN email_settings_done THEN 1 ELSE 0 END
   + CASE WHEN team_invited THEN 1 ELSE 0 END
   + CASE WHEN first_order_done THEN 1 ELSE 0 END)
  INTO _required_done
  FROM public.branch_onboarding_progress
  WHERE branch_id = _branch_id;

  IF _required_done >= 6 THEN
    UPDATE public.branch_onboarding_progress
    SET completed_at = COALESCE(completed_at, now())
    WHERE branch_id = _branch_id;
  ELSE
    UPDATE public.branch_onboarding_progress
    SET completed_at = NULL
    WHERE branch_id = _branch_id;
  END IF;
END;
$function$;