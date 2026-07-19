CREATE OR REPLACE FUNCTION public.create_spec_quote(
  p_app_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_customer_profile_id uuid,
  p_customer_email text,
  p_customer_name text,
  p_quote_name text,
  p_validity_days integer,
  p_notes_internal text,
  p_created_via text,
  p_product_family_id uuid,
  p_product_name text,
  p_product_slug text,
  p_quantity integer,
  p_unit_price numeric,
  p_total_amount numeric,
  p_currency text,
  p_spec jsonb
)
RETURNS TABLE(id uuid, quote_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_customer_profile_id uuid;
  v_holding_order_id uuid;
  v_holding_item_id uuid;
  v_quote_id uuid;
  v_quote_number text;
  v_valid_until timestamptz;
  v_created_via text;
  v_clean_email text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_app_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF p_product_family_id IS NULL THEN
    RAISE EXCEPTION 'Product family is required';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF COALESCE(p_unit_price, 0) < 0 OR COALESCE(p_total_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Quote pricing cannot be negative';
  END IF;

  v_clean_email := NULLIF(lower(trim(COALESCE(p_customer_email, ''))), '');
  IF v_clean_email IS NULL THEN
    RAISE EXCEPTION 'Customer email is required';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND (b.app_id = p_app_id OR b.app_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to this tenant';
  END IF;

  IF NOT public.user_is_staff_for_branch(p_app_id, p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to create quotes for this branch';
  END IF;

  IF p_customer_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_customer_profile_id
  ) THEN
    v_customer_profile_id := p_customer_profile_id;
  ELSE
    SELECT p.id
      INTO v_customer_profile_id
    FROM public.profiles p
    WHERE lower(p.email) = v_clean_email
    LIMIT 1;
  END IF;

  -- quotes.customer_profile_id and orders.user_id are currently NOT NULL and
  -- reference existing auth/profile rows. For pure email-only quotes, keep the
  -- provided email/name snapshot and attach holding records to the staff actor
  -- until a customer account exists.
  v_customer_profile_id := COALESCE(v_customer_profile_id, v_actor_id);

  v_created_via := CASE
    WHEN p_created_via IN ('tenant_sales', 'branch_sales') THEN 'sales'
    WHEN p_created_via IN ('customer', 'sales') THEN p_created_via
    ELSE 'sales'
  END;

  v_valid_until := now() + (GREATEST(COALESCE(p_validity_days, 30), 1)::text || ' days')::interval;
  v_quote_number := public.generate_quote_number(p_app_id);

  INSERT INTO public.orders (
    user_id,
    tenant_id,
    app_id,
    branch_id,
    order_status,
    total_price,
    currency,
    subtotal,
    total_amount,
    amount_due,
    ordered_by_profile_id,
    customer_email,
    customer_name,
    created_by_admin_profile_id,
    source_channel,
    metadata
  ) VALUES (
    v_customer_profile_id,
    p_tenant_id,
    p_app_id,
    p_branch_id,
    'quoted'::public.order_status,
    COALESCE(p_total_amount, 0),
    COALESCE(NULLIF(p_currency, ''), 'ZAR'),
    COALESCE(p_total_amount, 0),
    COALESCE(p_total_amount, 0),
    COALESCE(p_total_amount, 0),
    v_customer_profile_id,
    v_clean_email,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    v_actor_id,
    'spec_quote',
    jsonb_build_object('is_spec_quote_holding', true)
  )
  RETURNING orders.id INTO v_holding_order_id;

  INSERT INTO public.order_items (
    order_id,
    product_family_id,
    quantity,
    unit_price,
    build_status,
    spec,
    title
  ) VALUES (
    v_holding_order_id,
    p_product_family_id,
    p_quantity,
    COALESCE(p_unit_price, 0),
    'ready'::public.build_status,
    COALESCE(p_spec, '{}'::jsonb),
    COALESCE(NULLIF(trim(COALESCE(p_quote_name, '')), ''), NULLIF(trim(COALESCE(p_product_name, '')), ''), 'Quote item')
  )
  RETURNING order_items.id INTO v_holding_item_id;

  INSERT INTO public.quotes (
    app_id,
    tenant_id,
    branch_id,
    quote_number,
    name,
    customer_profile_id,
    customer_email,
    customer_name,
    created_by_profile_id,
    created_via,
    source_order_id,
    quote_status,
    valid_until,
    currency,
    subtotal,
    total_amount,
    notes_internal,
    metadata
  ) VALUES (
    p_app_id,
    p_tenant_id,
    p_branch_id,
    v_quote_number,
    NULLIF(trim(COALESCE(p_quote_name, '')), ''),
    v_customer_profile_id,
    v_clean_email,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    v_actor_id,
    v_created_via,
    v_holding_order_id,
    'active'::public.quote_status,
    v_valid_until,
    COALESCE(NULLIF(p_currency, ''), 'ZAR'),
    COALESCE(p_total_amount, 0),
    COALESCE(p_total_amount, 0),
    NULLIF(p_notes_internal, ''),
    jsonb_build_object(
      'is_spec_quote', true,
      'created_via_ui', p_created_via,
      'spec_summary', jsonb_build_object(
        'product', p_product_name,
        'quantity', p_quantity,
        'page_count', p_spec->>'page_count',
        'is_color', p_spec->>'is_color',
        'is_duplex', p_spec->>'is_duplex',
        'options', COALESCE(p_spec->'selected_options', '{}'::jsonb),
        'sections', p_spec->'sections'
      )
    )
  )
  RETURNING quotes.id INTO v_quote_id;

  INSERT INTO public.quote_items (
    quote_id,
    sequence_no,
    product_family_id,
    product_name,
    job_name,
    quantity,
    unit_price,
    net_price,
    gross_price,
    source_job_id,
    product_snapshot,
    configuration
  ) VALUES (
    v_quote_id,
    1,
    p_product_family_id,
    COALESCE(NULLIF(trim(COALESCE(p_product_name, '')), ''), 'Quote item'),
    NULLIF(trim(COALESCE(p_quote_name, '')), ''),
    p_quantity,
    COALESCE(p_unit_price, 0),
    COALESCE(p_total_amount, 0),
    COALESCE(p_total_amount, 0),
    v_holding_item_id,
    jsonb_build_object('name', p_product_name, 'slug', p_product_slug),
    COALESCE(p_spec, '{}'::jsonb)
  );

  RETURN QUERY SELECT v_quote_id, v_quote_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_spec_quote(uuid, uuid, uuid, uuid, text, text, text, integer, text, text, uuid, text, text, integer, numeric, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_spec_quote(uuid, uuid, uuid, uuid, text, text, text, integer, text, text, uuid, text, text, integer, numeric, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_spec_quote(uuid, uuid, uuid, uuid, text, text, text, integer, text, text, uuid, text, text, integer, numeric, numeric, text, jsonb) TO service_role;

DROP POLICY IF EXISTS order_items_insert_staff_membersship ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_staff_membership ON public.order_items;
DROP FUNCTION IF EXISTS public.user_can_insert_order_item_for_order(uuid);