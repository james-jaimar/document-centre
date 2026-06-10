
-- Platform-level settings (key/value) — separate from tenant_settings
CREATE TABLE public.platform_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  value_type text NOT NULL DEFAULT 'json',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, setting_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_select_platform_admin
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY platform_settings_insert_platform_admin
  ON public.platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY platform_settings_update_platform_admin
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY platform_settings_delete_platform_admin
  ON public.platform_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_platform_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_settings_updated_at();

-- Enforce a single platform-default email account (tenant_id null + branch_id null)
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_platform_default_uniq
  ON public.email_accounts ((1))
  WHERE tenant_id IS NULL AND branch_id IS NULL AND is_default = true;

-- Seed default notification toggles (all enabled by default).
INSERT INTO public.platform_settings (category, setting_key, setting_value, value_type, description) VALUES
  ('notifications','tenant_created',          'true'::jsonb, 'boolean', 'Notify platform admins when a tenant is created'),
  ('notifications','tenant_onboarding_done',  'true'::jsonb, 'boolean', 'Notify platform admins when tenant onboarding completes'),
  ('notifications','plan_changed',            'true'::jsonb, 'boolean', 'Notify tenant owners when their plan changes'),
  ('notifications','trial_started',           'true'::jsonb, 'boolean', 'Notify tenant when a branch trial starts'),
  ('notifications','subscription_past_due',   'true'::jsonb, 'boolean', 'Notify tenant + platform admins when subscription is past due'),
  ('notifications','subscription_cancelled',  'true'::jsonb, 'boolean', 'Notify tenant when subscription is cancelled'),
  ('notifications','invoice_paid',            'false'::jsonb,'boolean', 'Send receipt when a Stripe invoice is paid'),
  ('notifications','invoice_failed',          'true'::jsonb, 'boolean', 'Alert tenant + platform admins on failed Stripe invoice'),
  ('notifications','platform_admin_invite',   'true'::jsonb, 'boolean', 'Send invite email when granting platform admin access')
ON CONFLICT (category, setting_key) DO NOTHING;
