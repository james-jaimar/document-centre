-- 1. Tenant ownership on templates and triggers
ALTER TABLE public.platform_email_templates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS platform_email_templates_tenant_idx
  ON public.platform_email_templates (tenant_id);

ALTER TABLE public.platform_campaign_triggers
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2. Campaign audience + recipient kinds
ALTER TABLE public.platform_email_campaigns
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS link_mode text NOT NULL DEFAULT 'activation_page',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'platform';

ALTER TABLE public.platform_email_campaign_recipients
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.customer_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_kind text NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS unsubscribe_token text;

CREATE INDEX IF NOT EXISTS pecr_company_idx ON public.platform_email_campaign_recipients(company_id);
CREATE INDEX IF NOT EXISTS pecr_profile_idx ON public.platform_email_campaign_recipients(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS pecr_unsub_token_uq
  ON public.platform_email_campaign_recipients(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- 3. Activation pages / tokens for companies and customers
ALTER TABLE public.platform_branch_activation_pages
  ALTER COLUMN branch_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.customer_companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.platform_onboarding_tokens
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.customer_companies(id) ON DELETE CASCADE;

-- 4. Unsubscribe list
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  scope text NOT NULL DEFAULT 'marketing',
  reason text,
  source text,
  campaign_id uuid REFERENCES public.platform_email_campaigns(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES public.platform_email_campaign_recipients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribes_uq
  ON public.email_unsubscribes (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email), scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_unsubscribes TO authenticated;
GRANT ALL ON public.email_unsubscribes TO service_role;

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage unsubscribes"
  ON public.email_unsubscribes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "Tenant admins manage own unsubscribes"
  ON public.email_unsubscribes FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER email_unsubscribes_set_updated_at
  BEFORE UPDATE ON public.email_unsubscribes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Tenant RLS on the campaign tables
CREATE POLICY "Tenant admins manage own templates"
  ON public.platform_email_templates FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins manage own campaigns"
  ON public.platform_email_campaigns FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins manage own campaign recipients"
  ON public.platform_email_campaign_recipients FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_email_campaigns c
    WHERE c.id = campaign_id AND c.tenant_id IS NOT NULL AND public.user_is_tenant_admin(c.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_email_campaigns c
    WHERE c.id = campaign_id AND c.tenant_id IS NOT NULL AND public.user_is_tenant_admin(c.tenant_id)
  ));

CREATE POLICY "Tenant admins manage own triggers"
  ON public.platform_campaign_triggers FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins manage own activation pages"
  ON public.platform_branch_activation_pages FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins read own onboarding tokens"
  ON public.platform_onboarding_tokens FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));