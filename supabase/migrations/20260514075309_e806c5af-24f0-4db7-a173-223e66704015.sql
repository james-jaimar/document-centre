-- 1. Backfill: every active branch gets an enabled capability row for every active platform-level product family.
INSERT INTO public.branch_capabilities (branch_id, product_family_id, is_enabled)
SELECT b.id, pf.id, true
FROM public.branches b
CROSS JOIN public.product_families pf
WHERE b.is_active = true
  AND pf.tenant_id IS NULL
  AND pf.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.branch_capabilities bc
    WHERE bc.branch_id = b.id AND bc.product_family_id = pf.id
  );

-- 2. Auto-seed trigger: when a new platform-level product family is added,
-- create an enabled capability row for every existing active branch so we
-- don't have to manually backfill again.
CREATE OR REPLACE FUNCTION public.seed_capabilities_for_new_family()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.is_active = true THEN
    INSERT INTO public.branch_capabilities (branch_id, product_family_id, is_enabled)
    SELECT b.id, NEW.id, true
    FROM public.branches b
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.branch_capabilities bc
        WHERE bc.branch_id = b.id AND bc.product_family_id = NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_capabilities_for_new_family ON public.product_families;
CREATE TRIGGER trg_seed_capabilities_for_new_family
AFTER INSERT ON public.product_families
FOR EACH ROW
EXECUTE FUNCTION public.seed_capabilities_for_new_family();