
ALTER TABLE public.product_supplier_assignments
  ADD COLUMN IF NOT EXISTS markup_percent numeric,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_fingerprint text;

CREATE OR REPLACE FUNCTION public.supplier_trade_terms(p_link_id uuid, p_supplier_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.supplier_links;
  v_blocks jsonb;
  v_rate numeric := 0;
  v_enabled boolean := false;
  v_inclusive boolean := false;
  v_label text := 'VAT';
  v_lead int;
  v_min int;
  v_name text;
  v_raw jsonb;
BEGIN
  SELECT * INTO v_link FROM public.supplier_links WHERE id = p_link_id;
  IF v_link.id IS NULL OR v_link.status <> 'active' THEN
    RETURN jsonb_build_object('blocks', '[]'::jsonb);
  END IF;
  IF NOT (public.user_is_tenant_admin(v_link.buyer_tenant_id) OR public.user_is_tenant_admin(v_link.supplier_tenant_id)) THEN
    RETURN jsonb_build_object('blocks', '[]'::jsonb);
  END IF;

  v_blocks := public.supplier_trade_blocks(p_link_id, p_supplier_family_id);

  SELECT so.lead_time_days, so.min_quantity INTO v_lead, v_min
    FROM public.supplier_offerings so
   WHERE so.supplier_tenant_id = v_link.supplier_tenant_id
     AND so.product_family_id = p_supplier_family_id;

  SELECT t.name INTO v_name FROM public.tenants t WHERE t.id = v_link.supplier_tenant_id;

  SELECT setting_value INTO v_raw FROM public.tenant_settings
   WHERE tenant_id = v_link.supplier_tenant_id AND category = 'financial' AND setting_key = 'tax_rate';
  IF v_raw IS NOT NULL THEN
    BEGIN v_rate := (v_raw #>> '{}')::numeric; EXCEPTION WHEN others THEN v_rate := 0; END;
  END IF;

  v_enabled := v_rate > 0;
  SELECT setting_value INTO v_raw FROM public.tenant_settings
   WHERE tenant_id = v_link.supplier_tenant_id AND category = 'financial' AND setting_key = 'tax_enabled';
  IF v_raw IS NOT NULL THEN
    BEGIN v_enabled := (v_raw #>> '{}')::boolean AND v_rate > 0; EXCEPTION WHEN others THEN NULL; END;
  END IF;

  SELECT setting_value INTO v_raw FROM public.tenant_settings
   WHERE tenant_id = v_link.supplier_tenant_id AND category = 'financial' AND setting_key = 'tax_inclusive';
  IF v_raw IS NOT NULL THEN
    BEGIN v_inclusive := (v_raw #>> '{}')::boolean; EXCEPTION WHEN others THEN NULL; END;
  END IF;

  SELECT setting_value INTO v_raw FROM public.tenant_settings
   WHERE tenant_id = v_link.supplier_tenant_id AND category = 'financial' AND setting_key = 'tax_label';
  IF v_raw IS NOT NULL THEN v_label := COALESCE(v_raw #>> '{}', 'VAT'); END IF;

  RETURN jsonb_build_object(
    'blocks', COALESCE(v_blocks, '[]'::jsonb),
    'supplier_name', v_name,
    'lead_time_days', v_lead,
    'min_quantity', v_min,
    'tax', jsonb_build_object('enabled', v_enabled, 'rate', v_rate, 'inclusive', v_inclusive, 'label', v_label)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_trade_terms(uuid, uuid) TO authenticated;
