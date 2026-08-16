-- 1. unit_system columns
ALTER TABLE public.catalog_sizes     ADD COLUMN IF NOT EXISTS unit_system text NOT NULL DEFAULT 'metric';
ALTER TABLE public.catalog_papers    ADD COLUMN IF NOT EXISTS unit_system text NOT NULL DEFAULT 'metric';
ALTER TABLE public.catalog_finishing ADD COLUMN IF NOT EXISTS unit_system text NOT NULL DEFAULT 'metric';
ALTER TABLE public.catalog_finishing ADD COLUMN IF NOT EXISTS size_in numeric;

DO $$ BEGIN
  ALTER TABLE public.catalog_sizes     ADD CONSTRAINT catalog_sizes_unit_system_chk     CHECK (unit_system IN ('metric','imperial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.catalog_papers    ADD CONSTRAINT catalog_papers_unit_system_chk    CHECK (unit_system IN ('metric','imperial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.catalog_finishing ADD CONSTRAINT catalog_finishing_unit_system_chk CHECK (unit_system IN ('metric','imperial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. backfill: US-region sizes are the imperial list
UPDATE public.catalog_sizes SET unit_system = 'imperial' WHERE region = 'US';

CREATE INDEX IF NOT EXISTS catalog_sizes_unit_idx     ON public.catalog_sizes (scope_type, unit_system);
CREATE INDEX IF NOT EXISTS catalog_papers_unit_idx    ON public.catalog_papers (scope_type, unit_system);
CREATE INDEX IF NOT EXISTS catalog_finishing_unit_idx ON public.catalog_finishing (scope_type, unit_system);

-- 3. settings resolution helpers
CREATE OR REPLACE FUNCTION public.resolve_branch_setting(p_branch_id uuid, p_category text, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT bs.setting_value FROM public.branch_settings bs
      WHERE bs.branch_id = p_branch_id AND bs.category = p_category AND bs.setting_key = p_key),
    (SELECT public.resolve_tenant_setting(b.tenant_id, p_category, p_key)
       FROM public.branches b WHERE b.id = p_branch_id),
    'null'::jsonb
  );
$$;

-- Resolves the catalogue unit system for a tenant (and optionally a branch override).
CREATE OR REPLACE FUNCTION public.resolve_catalog_unit_system(p_tenant_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    v_raw := lower(trim(both '"' from COALESCE(public.resolve_branch_setting(p_branch_id, 'regional', 'measurement_unit')::text, 'null')));
  ELSE
    v_raw := lower(trim(both '"' from COALESCE(public.resolve_tenant_setting(p_tenant_id, 'regional', 'measurement_unit')::text, 'null')));
  END IF;
  IF v_raw = 'imperial' THEN RETURN 'imperial'; END IF;
  RETURN 'metric';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_branch_setting(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_catalog_unit_system(uuid, uuid) TO anon, authenticated, service_role;