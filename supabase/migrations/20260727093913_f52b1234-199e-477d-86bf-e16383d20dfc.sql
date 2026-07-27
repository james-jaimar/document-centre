
DROP FUNCTION IF EXISTS public.platform_backfill_branch_seeding();

CREATE OR REPLACE FUNCTION public.platform_backfill_branch_seeding()
RETURNS TABLE(out_branch_id uuid, healed boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_did boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR r IN SELECT id FROM public.branches LOOP
    BEGIN
      v_did := false;

      IF NOT EXISTS (SELECT 1 FROM public.catalog_sizes cs WHERE cs.scope_type='branch' AND cs.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_papers cp WHERE cp.scope_type='branch' AND cp.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices pp WHERE pp.scope_type='branch' AND pp.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices fp WHERE fp.scope_type='branch' AND fp.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.product_catalog_links pl WHERE pl.scope_type='branch' AND pl.branch_id=r.id) THEN
        PERFORM public.clone_tenant_catalog_to_branch(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.rate_card_clicks rc WHERE rc.scope_type='branch' AND rc.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.rate_card_photo_prints rp WHERE rp.scope_type='branch' AND rp.branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.rate_card_business_cards bc WHERE bc.scope_type='branch' AND bc.branch_id=r.id) THEN
        PERFORM public.clone_tenant_pricing_to_branch(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.branch_capabilities cap WHERE cap.branch_id=r.id) THEN
        PERFORM public.seed_branch_capabilities(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.delivery_zones dz WHERE dz.scope_type='branch' AND dz.branch_id=r.id) THEN
        PERFORM public.clone_tenant_delivery_to_branch(r.id);
        v_did := true;
      END IF;

      UPDATE public.branches SET pricing_seeded_at = now()
       WHERE id = r.id AND pricing_seeded_at IS NULL;

      out_branch_id := r.id; healed := v_did; err := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      out_branch_id := r.id; healed := false; err := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.platform_backfill_branch_seeding() TO authenticated;
