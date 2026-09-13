CREATE OR REPLACE FUNCTION public.generate_order_number(p_app_id uuid, p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_num bigint;
  v_seed bigint;
BEGIN
  IF p_tenant_id IS NOT NULL THEN
    SELECT prefix INTO v_prefix
      FROM public.number_sequences
     WHERE app_id = p_app_id
       AND sequence_type = 'order'
       AND tenant_id = p_tenant_id
       AND branch_id IS NULL
     LIMIT 1;

    IF v_prefix IS NULL THEN
      SELECT NULLIF(trim(setting_value #>> '{}'), '') INTO v_prefix
        FROM public.tenant_settings
       WHERE tenant_id = p_tenant_id
         AND category = 'financial'
         AND setting_key = 'invoice_prefix'
       LIMIT 1;

      IF v_prefix IS NOT NULL THEN
        -- Seed the series from the tenant's configured next invoice number
        -- so orders and invoices share one numbering convention.
        SELECT NULLIF(trim(setting_value #>> '{}'), '')::bigint INTO v_seed
          FROM public.tenant_settings
         WHERE tenant_id = p_tenant_id
           AND category = 'financial'
           AND setting_key = 'invoice_next_number'
         LIMIT 1;

        INSERT INTO public.number_sequences (app_id, sequence_type, tenant_id, branch_id, prefix, last_value)
        VALUES (p_app_id, 'order', p_tenant_id, NULL, v_prefix, GREATEST(COALESCE(v_seed - 1, 0), 0))
        ON CONFLICT (
          app_id,
          COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
          sequence_type
        ) DO NOTHING;
      END IF;
    END IF;

    IF v_prefix IS NOT NULL THEN
      UPDATE public.number_sequences
         SET last_value = last_value + 1
       WHERE app_id = p_app_id
         AND sequence_type = 'order'
         AND tenant_id = p_tenant_id
         AND branch_id IS NULL
      RETURNING last_value INTO v_num;

      IF v_num IS NOT NULL THEN
        RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
      END IF;
    END IF;
  END IF;

  RETURN public.generate_order_number(p_app_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO authenticated, service_role;