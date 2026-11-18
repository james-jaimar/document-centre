CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  tenant_id uuid,
  email text,
  display_name text,
  role text,
  current_path text,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_presence_tenant_seen_idx ON public.user_presence (tenant_id, last_seen_at DESC);
GRANT SELECT ON public.user_presence TO authenticated;
GRANT ALL ON public.user_presence TO service_role;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins see all presence" ON public.user_presence
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Tenant owners/admins see their tenant presence" ON public.user_presence
FOR SELECT TO authenticated USING (
  tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.profile_id = auth.uid() AND m.tenant_id = user_presence.tenant_id
      AND m.is_active AND lower(m.role) IN ('owner','admin')
  )
);

CREATE POLICY "Users see own presence" ON public.user_presence
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.presence_heartbeat(_tenant_id uuid, _path text, _user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  _role text;
  _tenant uuid;
  _email text;
  _name text;
BEGIN
  IF _uid IS NULL OR _anon THEN RETURN; END IF;

  IF _tenant_id IS NOT NULL THEN
    SELECT m.role INTO _role FROM public.tenant_memberships m
     WHERE m.profile_id = _uid AND m.tenant_id = _tenant_id AND m.is_active
     ORDER BY (lower(m.role) = 'customer') LIMIT 1;
    IF _role IS NOT NULL THEN _tenant := _tenant_id; END IF;
  END IF;

  IF public.has_role(_uid, 'platform_admin') THEN
    _role := 'platform_admin';
  END IF;

  SELECT p.email, coalesce(nullif(p.display_name,''), nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''))
    INTO _email, _name FROM public.profiles p WHERE p.id = _uid;

  INSERT INTO public.user_presence (user_id, tenant_id, email, display_name, role, current_path, user_agent, last_seen_at)
  VALUES (_uid, _tenant, _email, _name, _role, left(_path, 500), left(_user_agent, 300), now())
  ON CONFLICT (user_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email, display_name = EXCLUDED.display_name,
    role = EXCLUDED.role, current_path = EXCLUDED.current_path, user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    first_seen_at = CASE WHEN user_presence.last_seen_at < now() - interval '15 minutes' THEN now() ELSE user_presence.first_seen_at END;
END $$;
REVOKE ALL ON FUNCTION public.presence_heartbeat(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.presence_heartbeat(uuid, text, text) TO authenticated;