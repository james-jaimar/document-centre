DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.branches LOOP
    PERFORM public.clone_tenant_pricing_to_branch(r.id);
  END LOOP;
END $$;