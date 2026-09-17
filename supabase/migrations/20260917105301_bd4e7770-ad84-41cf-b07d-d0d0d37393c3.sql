CREATE OR REPLACE FUNCTION public.resolve_account_balance(p_tenant_id uuid, p_company_id uuid DEFAULT NULL::uuid, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric := 0;
  v_credit numeric := 0;
  v_alloc numeric;
  v_residual numeric;
  v_current numeric := 0;
  v_30 numeric := 0;
  v_60 numeric := 0;
  v_90 numeric := 0;
  v_overdue numeric := 0;
  r record;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO v_balance
  FROM public.customer_account_ledger l
  WHERE l.tenant_id = p_tenant_id
    AND (
      (p_company_id IS NOT NULL AND l.company_id = p_company_id)
      OR (p_company_id IS NULL AND p_profile_id IS NOT NULL AND l.customer_profile_id = p_profile_id)
    );

  SELECT COALESCE(SUM(-amount), 0)
    INTO v_credit
  FROM public.customer_account_ledger l
  WHERE l.tenant_id = p_tenant_id
    AND l.entry_type <> 'charge'
    AND (
      (p_company_id IS NOT NULL AND l.company_id = p_company_id)
      OR (p_company_id IS NULL AND p_profile_id IS NOT NULL AND l.customer_profile_id = p_profile_id)
    );

  FOR r IN
    SELECT l.amount, l.due_date
    FROM public.customer_account_ledger l
    WHERE l.tenant_id = p_tenant_id
      AND l.entry_type = 'charge'
      AND (
        (p_company_id IS NOT NULL AND l.company_id = p_company_id)
        OR (p_company_id IS NULL AND p_profile_id IS NOT NULL AND l.customer_profile_id = p_profile_id)
      )
    ORDER BY l.entry_date ASC, l.created_at ASC
  LOOP
    v_alloc := LEAST(GREATEST(v_credit, 0), GREATEST(r.amount, 0));
    v_credit := v_credit - v_alloc;
    v_residual := r.amount - v_alloc;

    IF v_residual <> 0 THEN
      IF r.due_date IS NULL OR r.due_date >= CURRENT_DATE THEN
        v_current := v_current + v_residual;
      ELSE
        v_overdue := v_overdue + v_residual;
        IF r.due_date >= CURRENT_DATE - 30 THEN
          v_30 := v_30 + v_residual;
        ELSIF r.due_date >= CURRENT_DATE - 60 THEN
          v_60 := v_60 + v_residual;
        ELSE
          v_90 := v_90 + v_residual;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_credit > 0 THEN
    v_current := v_current - v_credit;
  END IF;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'overdue', v_overdue,
    'bucket_current', v_current,
    'bucket_30', v_30,
    'bucket_60', v_60,
    'bucket_90', v_90
  );
END;
$function$;