
-- Templates
CREATE TABLE public.platform_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_email_templates TO authenticated;
GRANT ALL ON public.platform_email_templates TO service_role;
ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage templates"
  ON public.platform_email_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'));

-- Campaigns
CREATE TABLE public.platform_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  template_slug TEXT NOT NULL,
  subject_snapshot TEXT NOT NULL,
  body_html_snapshot TEXT NOT NULL,
  body_text_snapshot TEXT,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_email_campaigns TO authenticated;
GRANT ALL ON public.platform_email_campaigns TO service_role;
ALTER TABLE public.platform_email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage campaigns"
  ON public.platform_email_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'));

-- Recipients
CREATE TABLE public.platform_email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.platform_email_campaigns(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  email TEXT,
  status TEXT NOT NULL,
  error TEXT,
  action_link TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pecr_campaign ON public.platform_email_campaign_recipients(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_email_campaign_recipients TO authenticated;
GRANT ALL ON public.platform_email_campaign_recipients TO service_role;
ALTER TABLE public.platform_email_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage recipients"
  ON public.platform_email_campaign_recipients FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'platform_admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_platform_email_templates()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_platform_email_templates
  BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_email_templates();

-- Seed Branch Welcome template
INSERT INTO public.platform_email_templates (slug, name, description, subject, body_html, body_text, is_system)
VALUES (
  'branch_welcome',
  'Branch Welcome',
  'Sent to a branch contact with their store URL and one-time login link.',
  'Welcome to {{portal_name}} — your store is ready',
  '<p>Hi {{contact_name}},</p>
<p>Your <strong>{{tenant_name}}</strong> store <strong>{{branch_name}}</strong> is ready to go on {{portal_name}}.</p>
<p><strong>Your store URL:</strong> <a href="{{store_url}}">{{store_url}}</a><br/>
<strong>Your login email:</strong> {{login_email}}</p>
<p>Click the button below to set your password and sign in for the first time. This link is one-time use and expires shortly for security.</p>
<p><a href="{{action_link}}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">Set password & sign in</a></p>
<p>Once inside you''ll be prompted to choose a new password, then you can complete your branch onboarding.</p>
<p>Welcome aboard,<br/>The {{portal_name}} team</p>',
  'Hi {{contact_name}},

Your {{tenant_name}} store {{branch_name}} is ready on {{portal_name}}.

Store URL: {{store_url}}
Login email: {{login_email}}

Set your password and sign in (one-time link): {{action_link}}

Welcome aboard,
The {{portal_name}} team',
  true
);
