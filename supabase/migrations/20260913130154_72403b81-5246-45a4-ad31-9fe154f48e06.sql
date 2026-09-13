
CREATE OR REPLACE FUNCTION public.accept_supplier_invite(p_code text, p_buyer_tenant_id uuid)
RETURNS public.supplier_links
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.supplier_links;
BEGIN
  IF NOT public.user_is_tenant_admin(p_buyer_tenant_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business to accept an invite';
  END IF;

  SELECT * INTO v_link FROM public.supplier_links
  WHERE invite_code = upper(btrim(p_code));

  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'That invite code was not found';
  END IF;
  IF v_link.status = 'revoked' THEN
    RAISE EXCEPTION 'That invite has been withdrawn';
  END IF;
  IF v_link.status = 'active' AND v_link.buyer_tenant_id IS DISTINCT FROM p_buyer_tenant_id THEN
    RAISE EXCEPTION 'That invite has already been used';
  END IF;
  IF v_link.invite_expires_at < now() AND v_link.status <> 'active' THEN
    RAISE EXCEPTION 'That invite has expired';
  END IF;
  IF v_link.supplier_tenant_id = p_buyer_tenant_id THEN
    RAISE EXCEPTION 'You cannot become your own supplier';
  END IF;
  IF v_link.buyer_tenant_id IS NOT NULL AND v_link.buyer_tenant_id <> p_buyer_tenant_id THEN
    RAISE EXCEPTION 'That invite was issued to a different business';
  END IF;

  UPDATE public.supplier_links
     SET buyer_tenant_id = p_buyer_tenant_id,
         status = 'active',
         accepted_at = COALESCE(accepted_at, now())
   WHERE id = v_link.id
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.supplier_catalogue(p_link_id uuid)
RETURNS TABLE (
  product_family_id uuid,
  name text,
  slug text,
  lead_time_days integer,
  min_quantity integer,
  notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.supplier_links;
BEGIN
  SELECT * INTO v_link FROM public.supplier_links WHERE id = p_link_id;
  IF v_link.id IS NULL OR v_link.status <> 'active' THEN
    RETURN;
  END IF;
  IF NOT (public.user_is_tenant_admin(v_link.buyer_tenant_id) OR public.user_is_tenant_admin(v_link.supplier_tenant_id)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pf.id, pf.name, pf.slug, so.lead_time_days, so.min_quantity, so.notes
    FROM public.supplier_offerings so
    JOIN public.product_families pf ON pf.id = so.product_family_id
   WHERE so.supplier_tenant_id = v_link.supplier_tenant_id
     AND so.is_offered
   ORDER BY pf.sort_order, pf.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.supplier_trade_blocks(p_link_id uuid, p_supplier_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.supplier_links;
  v_blocks jsonb;
BEGIN
  SELECT * INTO v_link FROM public.supplier_links WHERE id = p_link_id;
  IF v_link.id IS NULL OR v_link.status <> 'active' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF NOT (public.user_is_tenant_admin(v_link.buyer_tenant_id) OR public.user_is_tenant_admin(v_link.supplier_tenant_id)) THEN
    RETURN '[]'::jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_offerings so
     WHERE so.supplier_tenant_id = v_link.supplier_tenant_id
       AND so.product_family_id = p_supplier_family_id
       AND so.is_offered
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT o.quantity_blocks INTO v_blocks
    FROM public.product_pack_pricing_overrides o
   WHERE o.tenant_id = v_link.supplier_tenant_id
     AND o.branch_id IS NULL
     AND o.product_family_id = p_supplier_family_id
   LIMIT 1;

  IF v_blocks IS NULL OR jsonb_array_length(COALESCE(v_blocks, '[]'::jsonb)) = 0 THEN
    SELECT pf.quantity_blocks INTO v_blocks FROM public.product_families pf WHERE pf.id = p_supplier_family_id;
  END IF;

  RETURN COALESCE(v_blocks, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_supplier_invite(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supplier_catalogue(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supplier_trade_blocks(uuid, uuid) FROM anon;
