-- Drop legacy 2-arg overload that clashes with the 4-arg version (which has defaults)
DROP FUNCTION IF EXISTS public.next_number(uuid, text);

-- Recreate order/quote generators to call the 4-arg version explicitly
CREATE OR REPLACE FUNCTION public.generate_order_number(p_app_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_num bigint;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.number_sequences
  WHERE app_id = p_app_id
    AND sequence_type = 'order'
    AND tenant_id IS NULL
    AND branch_id IS NULL
  LIMIT 1;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Missing order sequence prefix for app %', p_app_id;
  END IF;

  v_num := public.next_number(p_app_id, 'order', NULL::uuid, NULL::uuid);
  RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_quote_number(p_app_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_num bigint;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.number_sequences
  WHERE app_id = p_app_id
    AND sequence_type = 'quote'
    AND tenant_id IS NULL
    AND branch_id IS NULL
  LIMIT 1;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Missing quote sequence prefix for app %', p_app_id;
  END IF;

  v_num := public.next_number(p_app_id, 'quote', NULL::uuid, NULL::uuid);
  RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
END;
$function$;