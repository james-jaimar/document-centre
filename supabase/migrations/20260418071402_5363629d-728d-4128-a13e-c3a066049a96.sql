
-- Audit table for user admin operations
CREATE TABLE public.user_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null,
  target_profile_id uuid,
  target_email text,
  tenant_id uuid,
  app_id uuid,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

ALTER TABLE public.user_admin_audit ENABLE ROW LEVEL SECURITY;

-- Tenant admins can read audit rows scoped to their tenant; platform admins read all
CREATE POLICY "user_admin_audit_select_admins"
ON public.user_admin_audit
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR (tenant_id IS NOT NULL AND user_is_member_admin(app_id, tenant_id))
);

CREATE INDEX idx_user_admin_audit_tenant ON public.user_admin_audit(tenant_id, created_at DESC);
CREATE INDEX idx_user_admin_audit_target ON public.user_admin_audit(target_profile_id, created_at DESC);
