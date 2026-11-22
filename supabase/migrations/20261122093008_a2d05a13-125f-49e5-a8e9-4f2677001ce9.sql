CREATE POLICY bookshelf_switch_read ON public.tenant_settings FOR SELECT TO anon,authenticated USING (category='bookshelf' AND setting_key='enabled' AND is_sensitive=false AND (public.current_storefront_tenant_id() IS NULL OR tenant_id=public.current_storefront_tenant_id()));
ALTER FUNCTION public.bookshelf_enabled(uuid) SECURITY INVOKER;
CREATE INDEX bookshelf_tenant_idx ON public.bookshelf_items(tenant_id);
CREATE INDEX bookshelf_profile_idx ON public.bookshelf_items(profile_id);