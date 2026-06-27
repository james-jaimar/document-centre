
CREATE TABLE public.platform_onboarding_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  campaign_recipient_id uuid REFERENCES public.platform_email_campaign_recipients(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  profile_id uuid,
  email text NOT NULL,
  purpose text NOT NULL DEFAULT 'branch_welcome',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  consumed_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_onboarding_tokens_token ON public.platform_onboarding_tokens(token);
CREATE INDEX idx_platform_onboarding_tokens_recipient ON public.platform_onboarding_tokens(campaign_recipient_id);

GRANT ALL ON public.platform_onboarding_tokens TO service_role;

ALTER TABLE public.platform_onboarding_tokens ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: this table is exclusively service-role.
CREATE POLICY "platform admins can read"
  ON public.platform_onboarding_tokens
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));
GRANT SELECT ON public.platform_onboarding_tokens TO authenticated;
