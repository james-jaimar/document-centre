
-- 1) Extend number_sequences with tenant/branch scope
ALTER TABLE public.number_sequences
  ADD COLUMN IF NOT EXISTS tenant_id uuid NULL,
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL;

-- Drop any old unique constraint / index on (app_id, sequence_type)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.number_sequences'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.number_sequences DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS public.number_sequences_app_id_sequence_type_key;
DROP INDEX IF EXISTS public.number_sequences_app_type_key;

-- One row per (app, tenant?, branch?, sequence_type). NULLs distinguish global/tenant/branch scopes.
CREATE UNIQUE INDEX IF NOT EXISTS number_sequences_scope_key
  ON public.number_sequences (
    app_id,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sequence_type
  );

-- 2) Rewrite next_number to accept optional tenant/branch scope
CREATE OR REPLACE FUNCTION public.next_number(
  p_app_id uuid,
  p_sequence_type text,
  p_tenant_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
  v_seed_setting bigint;
  v_app_last bigint;
  v_prefix text;
BEGIN
  -- Fast path: try to bump the most specific existing row.
  UPDATE public.number_sequences
     SET last_value = last_value + 1
   WHERE app_id = p_app_id
     AND sequence_type = p_sequence_type
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id
     AND branch_id IS NOT DISTINCT FROM p_branch_id
  RETURNING last_value INTO v_next;

  IF v_next IS NOT NULL THEN
    RETURN v_next;
  END IF;

  -- Seed a new scoped row. Look up the scoped starting value from settings.
  IF p_sequence_type = 'invoice' AND p_branch_id IS NOT NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '')::bigint INTO v_seed_setting
      FROM public.branch_settings
     WHERE branch_id = p_branch_id
       AND category = 'financial'
       AND setting_key = 'invoice_next_number'
     LIMIT 1;
  ELSIF p_sequence_type = 'invoice' AND p_tenant_id IS NOT NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '')::bigint INTO v_seed_setting
      FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id
       AND category = 'financial'
       AND setting_key = 'invoice_next_number'
     LIMIT 1;
  END IF;

  -- Also read the app-wide fallback to make sure branch numbering never
  -- silently starts below the global counter.
  SELECT last_value, prefix INTO v_app_last, v_prefix
    FROM public.number_sequences
   WHERE app_id = p_app_id
     AND sequence_type = p_sequence_type
     AND tenant_id IS NULL
     AND branch_id IS NULL
   LIMIT 1;

  -- Chosen starting last_value = seed_setting - 1 (so first returned = seed_setting).
  -- If no setting, use app-wide last_value; if that's missing, start at 1000.
  INSERT INTO public.number_sequences (app_id, sequence_type, tenant_id, branch_id, prefix, last_value)
  VALUES (
    p_app_id,
    p_sequence_type,
    p_tenant_id,
    p_branch_id,
    COALESCE(v_prefix, 'INV'),
    GREATEST(
      COALESCE(v_seed_setting - 1, -1),
      COALESCE(v_app_last, 1000)
    )
  )
  ON CONFLICT (
    app_id,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sequence_type
  ) DO NOTHING;

  UPDATE public.number_sequences
     SET last_value = last_value + 1
   WHERE app_id = p_app_id
     AND sequence_type = p_sequence_type
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id
     AND branch_id IS NOT DISTINCT FROM p_branch_id
  RETURNING last_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Missing number sequence for app % type % (tenant=%, branch=%)',
      p_app_id, p_sequence_type, p_tenant_id, p_branch_id;
  END IF;

  RETURN v_next;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_number(uuid, text, uuid, uuid) FROM anon, authenticated;

-- 3) Invoice number generator now takes an optional branch_id and resolves
--    prefix/suffix/format from branch_settings first, then tenant_settings.
CREATE OR REPLACE FUNCTION public.generate_invoice_number(
  p_tenant_id uuid,
  p_app_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_format text;
  v_next bigint;
  v_year text;
  v_yearmonth text;
  v_seq_padded text;
  v_result text;
BEGIN
  -- Resolve prefix: branch → tenant → app sequence → 'INV'
  IF p_branch_id IS NOT NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_prefix
      FROM public.branch_settings
     WHERE branch_id = p_branch_id
       AND category = 'financial'
       AND setting_key = 'invoice_prefix'
     LIMIT 1;
  END IF;

  IF v_prefix IS NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_prefix
      FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id
       AND category = 'financial'
       AND setting_key = 'invoice_prefix'
     LIMIT 1;
  END IF;

  IF v_prefix IS NULL THEN
    SELECT prefix INTO v_prefix
      FROM public.number_sequences
     WHERE app_id = p_app_id AND sequence_type = 'invoice'
       AND tenant_id IS NULL AND branch_id IS NULL
     LIMIT 1;
  END IF;

  IF v_prefix IS NULL THEN v_prefix := 'INV'; END IF;

  -- Optional suffix: branch → tenant
  IF p_branch_id IS NOT NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_suffix
      FROM public.branch_settings
     WHERE branch_id = p_branch_id
       AND category = 'financial'
       AND setting_key = 'invoice_suffix'
     LIMIT 1;
  END IF;
  IF v_suffix IS NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_suffix
      FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id
       AND category = 'financial'
       AND setting_key = 'invoice_suffix'
     LIMIT 1;
  END IF;

  -- Format template: branch → tenant → default. Tokens: {prefix} {suffix} {yyyy} {yyyymm} {seq}
  IF p_branch_id IS NOT NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_format
      FROM public.branch_settings
     WHERE branch_id = p_branch_id
       AND category = 'financial'
       AND setting_key = 'invoice_number_format'
     LIMIT 1;
  END IF;
  IF v_format IS NULL THEN
    SELECT NULLIF(setting_value #>> '{}', '') INTO v_format
      FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id
       AND category = 'financial'
       AND setting_key = 'invoice_number_format'
     LIMIT 1;
  END IF;
  IF v_format IS NULL OR v_format = '' THEN
    v_format := '{prefix}-{yyyy}-{seq}';
  END IF;

  -- Get the scoped sequence value (branch-scoped when branch provided).
  v_next := public.next_number(p_app_id, 'invoice', p_tenant_id, p_branch_id);
  v_year := to_char(now(), 'YYYY');
  v_yearmonth := to_char(now(), 'YYYYMM');
  v_seq_padded := lpad(v_next::text, 5, '0');

  v_result := v_format;
  v_result := replace(v_result, '{prefix}', v_prefix);
  v_result := replace(v_result, '{suffix}', COALESCE(v_suffix, ''));
  v_result := replace(v_result, '{yyyy}', v_year);
  v_result := replace(v_result, '{yyyymm}', v_yearmonth);
  v_result := replace(v_result, '{seq}', v_seq_padded);

  -- Trim any dangling separators from empty tokens
  v_result := regexp_replace(v_result, '-{2,}', '-', 'g');
  v_result := regexp_replace(v_result, '(^-|-$)', '', 'g');

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid, uuid, uuid) FROM anon, authenticated;

-- Drop old 2-arg signature so callers use the new one.
DROP FUNCTION IF EXISTS public.generate_invoice_number(uuid, uuid);

CREATE OR REPLACE FUNCTION public.issue_invoice_number(
  p_tenant_id uuid,
  p_app_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_invoice_number(p_tenant_id, p_app_id, p_branch_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_invoice_number(uuid, uuid, uuid) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.issue_invoice_number(uuid, uuid);
