CREATE OR REPLACE FUNCTION public.resolve_delivery_zone(p_tenant_id uuid, p_branch_id uuid, p_city text, p_postal_code text, p_province text, p_country text DEFAULT 'ZA'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_zone_id uuid;
  v_country text := COALESCE(p_country, 'ZA');
BEGIN
  -- Pass 1: specific location match across ALL scopes.
  -- Priority: match_type (postcode_prefix > city > province),
  --           then scope (branch=1 < tenant=2 < platform=3),
  --           then specificity within postcode_prefix (longer prefix first).

  -- Postcode prefix
  IF p_postal_code IS NOT NULL AND p_postal_code <> '' THEN
    SELECT z.id INTO v_zone_id
    FROM public.delivery_zone_locations l
    JOIN public.delivery_zones z ON z.id = l.zone_id
    WHERE l.country = v_country
      AND l.match_type = 'postcode_prefix'
      AND p_postal_code LIKE (l.value || '%')
      AND z.is_active
      AND (
        (z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
        OR (z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
        OR (z.scope_type::text = 'platform')
      )
    ORDER BY
      CASE z.scope_type::text WHEN 'branch' THEN 1 WHEN 'tenant' THEN 2 ELSE 3 END,
      length(l.value) DESC
    LIMIT 1;
    IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
  END IF;

  -- City
  IF p_city IS NOT NULL AND p_city <> '' THEN
    SELECT z.id INTO v_zone_id
    FROM public.delivery_zone_locations l
    JOIN public.delivery_zones z ON z.id = l.zone_id
    WHERE l.country = v_country
      AND l.match_type = 'city'
      AND lower(l.value) = lower(p_city)
      AND z.is_active
      AND (
        (z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
        OR (z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
        OR (z.scope_type::text = 'platform')
      )
    ORDER BY
      CASE z.scope_type::text WHEN 'branch' THEN 1 WHEN 'tenant' THEN 2 ELSE 3 END
    LIMIT 1;
    IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
  END IF;

  -- Province
  IF p_province IS NOT NULL AND p_province <> '' THEN
    SELECT z.id INTO v_zone_id
    FROM public.delivery_zone_locations l
    JOIN public.delivery_zones z ON z.id = l.zone_id
    WHERE l.country = v_country
      AND l.match_type = 'province'
      AND lower(l.value) = lower(p_province)
      AND z.is_active
      AND (
        (z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
        OR (z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
        OR (z.scope_type::text = 'platform')
      )
    ORDER BY
      CASE z.scope_type::text WHEN 'branch' THEN 1 WHEN 'tenant' THEN 2 ELSE 3 END
    LIMIT 1;
    IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
  END IF;

  -- Pass 2: fallback zone, scope priority branch -> tenant -> platform.
  SELECT id INTO v_zone_id FROM public.delivery_zones
  WHERE is_active AND is_default_fallback AND scope_type::text = 'branch' AND branch_id = p_branch_id
  LIMIT 1;
  IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;

  SELECT id INTO v_zone_id FROM public.delivery_zones
  WHERE is_active AND is_default_fallback AND scope_type::text = 'tenant'
    AND tenant_id = p_tenant_id AND branch_id IS NULL
  LIMIT 1;
  IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;

  SELECT id INTO v_zone_id FROM public.delivery_zones
  WHERE is_active AND is_default_fallback AND scope_type::text = 'platform'
  LIMIT 1;
  RETURN v_zone_id;
END;
$function$;