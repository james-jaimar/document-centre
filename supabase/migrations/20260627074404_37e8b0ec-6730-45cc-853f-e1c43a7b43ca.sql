
-- 1. Activation pages (one per branch we want to be able to onboard)
CREATE TABLE public.platform_branch_activation_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE UNIQUE,
  app_id UUID,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pbap_slug ON public.platform_branch_activation_pages(slug);
CREATE INDEX idx_pbap_tenant ON public.platform_branch_activation_pages(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_branch_activation_pages TO authenticated;
GRANT ALL ON public.platform_branch_activation_pages TO service_role;
ALTER TABLE public.platform_branch_activation_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage activation pages"
  ON public.platform_branch_activation_pages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'));

CREATE OR REPLACE FUNCTION public.touch_platform_branch_activation_pages()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_pbap
  BEFORE UPDATE ON public.platform_branch_activation_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_branch_activation_pages();

-- 2. Activation request audit + rate-limit
CREATE TABLE public.platform_activation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  ip_hash TEXT,
  email_confirmed BOOLEAN NOT NULL DEFAULT false,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_par_slug_created ON public.platform_activation_requests(slug, created_at DESC);
GRANT ALL ON public.platform_activation_requests TO service_role;
GRANT SELECT ON public.platform_activation_requests TO authenticated;
ALTER TABLE public.platform_activation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read activation requests"
  ON public.platform_activation_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'));

-- 3. "kind" column on templates + campaigns
ALTER TABLE public.platform_email_templates
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'activation';
ALTER TABLE public.platform_email_campaigns
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'activation';

-- Existing "branch_welcome" template is the activation email — leave kind as 'activation'.

-- 4. Seed marketing template
INSERT INTO public.platform_email_templates (slug, name, description, subject, body_html, body_text, is_system, kind)
VALUES (
  'marketing_branch_offer',
  'Marketing — Branch Offer',
  'Branded pitch email sent in bulk. Links to a per-branch activation page where the recipient requests their own sign-in link.',
  'A faster way to take print orders at {{branch_name}}',
  '<p>Hi {{contact_name}},</p>
<p>We''re launching <strong>Document Centre</strong> with {{tenant_name}} — a web-to-print storefront that lets your customers upload, configure and pay for print jobs at <strong>{{branch_name}}</strong> in minutes, without a single back-and-forth email.</p>
<p>Your branch already has a storefront waiting. To activate it, head to the page below and we''ll email a one-time sign-in link to the address on file.</p>
<p><a href="{{activation_link}}" style="display:inline-block;background:#0a2358;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;">Activate {{branch_name}}</a></p>
<p style="font-size:13px;color:#6b7280;">For security, only the contact email we have on file can request the sign-in link. If that''s not you, please forward this to the right person at {{branch_name}}.</p>
<p>Talk soon,<br/>The Document Centre team</p>',
  'Hi {{contact_name}},

We''re launching Document Centre with {{tenant_name}} — a web-to-print storefront for {{branch_name}}.

Activate your branch storefront here: {{activation_link}}

For security, only the contact email on file can request the sign-in link.

The Document Centre team',
  true,
  'marketing'
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Seed self-service activation template (separate from the existing branch_welcome
-- so platform admins can tune the wording differently for "you requested this" sends)
INSERT INTO public.platform_email_templates (slug, name, description, subject, body_html, body_text, is_system, kind)
VALUES (
  'activation_branch_manager',
  'Activation — Branch Manager Sign-in Link',
  'Triggered when the recipient confirms their email on the public activation page. Carries the reusable /welcome?token=… link.',
  'Your sign-in link for {{branch_name}}',
  '<p>Hi {{contact_name}},</p>
<p>You requested a sign-in link for your <strong>{{tenant_name}}</strong> storefront — <strong>{{branch_name}}</strong>. Here it is:</p>
<p><a href="{{action_link}}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">Sign in to {{branch_name}}</a></p>
<p>This link is valid for <strong>1 hour</strong> and can be opened as many times as you need until you''ve set your password. After that, you''ll sign in with the password you choose.</p>
<p><strong>Your store URL:</strong> <a href="{{store_url}}">{{store_url}}</a><br/>
<strong>Your login email:</strong> {{login_email}}</p>
<p>Welcome aboard,<br/>The {{portal_name}} team</p>',
  'Hi {{contact_name}},

You requested a sign-in link for {{branch_name}} on {{portal_name}}.

Sign in: {{action_link}}

This link is valid for 1 hour and works until you have set your password.

Store URL: {{store_url}}
Login email: {{login_email}}

The {{portal_name}} team',
  true,
  'activation'
)
ON CONFLICT (slug) DO NOTHING;
