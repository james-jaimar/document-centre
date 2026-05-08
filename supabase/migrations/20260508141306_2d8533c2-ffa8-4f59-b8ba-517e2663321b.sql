CREATE OR REPLACE FUNCTION public._temp_bulk_import_branches(rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO public.branches
      (tenant_id, slug, code, external_ref, name, email, phone, address, city, province, postal_code, country, is_active, settings)
    VALUES
      ((r->>'tenant_id')::uuid,
       r->>'slug',
       r->>'code',
       r->>'external_ref',
       r->>'name',
       r->>'email',
       r->>'phone',
       r->>'address',
       r->>'city',
       r->>'province',
       r->>'postal_code',
       COALESCE(r->>'country', 'ZA'),
       COALESCE((r->>'is_active')::boolean, true),
       COALESCE(r->'settings', '{}'::jsonb))
    ON CONFLICT DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;
  END LOOP;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public._temp_bulk_import_branches(jsonb) TO anon, authenticated;