CREATE OR REPLACE FUNCTION public.branch_setting_own(p_branch_id uuid, p_category text, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT bs.setting_value FROM public.branch_settings bs
      WHERE bs.branch_id = p_branch_id AND bs.category = p_category AND bs.setting_key = p_key),
    'null'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.branch_setting_own(uuid, text, text) TO anon, authenticated, service_role;