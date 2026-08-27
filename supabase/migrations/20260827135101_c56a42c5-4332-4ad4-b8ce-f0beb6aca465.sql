CREATE OR REPLACE FUNCTION public.seed_capabilities_for_new_family()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.is_active = true THEN
    -- New master products are seeded DISABLED everywhere; a platform/tenant
    -- admin must opt each branch in explicitly.
    INSERT INTO public.branch_capabilities (branch_id, product_family_id, is_enabled)
    SELECT b.id, NEW.id, false
    FROM public.branches b
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.branch_capabilities bc
        WHERE bc.branch_id = b.id AND bc.product_family_id = NEW.id
      );

    INSERT INTO public.tenant_product_toggles (tenant_id, product_family_id, is_enabled)
    SELECT t.id, NEW.id, false
    FROM public.tenants t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_product_toggles tpt
      WHERE tpt.tenant_id = t.id AND tpt.product_family_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;