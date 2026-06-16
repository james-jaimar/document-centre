
-- 1) Widen pricing_engine check constraint to allow 'business_cards'
ALTER TABLE public.product_families
  DROP CONSTRAINT IF EXISTS product_families_pricing_engine_check;
ALTER TABLE public.product_families
  ADD CONSTRAINT product_families_pricing_engine_check
  CHECK (pricing_engine = ANY (ARRAY['click_charges'::text, 'photo_prints'::text, 'business_cards'::text]));

-- 2) Auto-clone trigger on tenant creation
CREATE OR REPLACE FUNCTION public.auto_clone_master_to_new_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Both functions are idempotent (NOT EXISTS guards) so safe to call.
  BEGIN
    PERFORM public.clone_master_catalog_to_tenant(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_clone_master_to_new_tenant: catalog clone failed for tenant %: %', NEW.id, SQLERRM;
  END;
  BEGIN
    PERFORM public.clone_master_rate_card_to_tenant(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_clone_master_to_new_tenant: rate-card clone failed for tenant %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_clone_master_to_new_tenant ON public.tenants;
CREATE TRIGGER trg_auto_clone_master_to_new_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_clone_master_to_new_tenant();
