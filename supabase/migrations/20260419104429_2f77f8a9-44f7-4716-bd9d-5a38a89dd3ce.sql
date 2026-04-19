-- ============================================================================
-- EMAIL ACCOUNTS: per-tenant / per-branch SMTP credentials
-- ============================================================================

CREATE TABLE public.email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  label text NOT NULL,
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_secure text NOT NULL DEFAULT 'tls' CHECK (smtp_secure IN ('tls','starttls','none')),
  smtp_username text NOT NULL,
  smtp_password_secret_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  max_concurrent integer NOT NULL DEFAULT 1,
  send_delay_ms integer NOT NULL DEFAULT 1500,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_accounts_tenant ON public.email_accounts(tenant_id) WHERE is_active = true;
CREATE INDEX idx_email_accounts_branch ON public.email_accounts(branch_id) WHERE branch_id IS NOT NULL AND is_active = true;
CREATE UNIQUE INDEX idx_email_accounts_one_tenant_default
  ON public.email_accounts(tenant_id)
  WHERE is_default = true AND branch_id IS NULL;
CREATE UNIQUE INDEX idx_email_accounts_one_branch_default
  ON public.email_accounts(branch_id)
  WHERE is_default = true AND branch_id IS NOT NULL;

CREATE TRIGGER trg_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_accounts_select_tenant_admin
  ON public.email_accounts FOR SELECT TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

CREATE POLICY email_accounts_select_branch_staff
  ON public.email_accounts FOR SELECT TO authenticated
  USING (
    branch_id IS NOT NULL
    AND branch_id = public.user_branch_id()
  );

CREATE POLICY email_accounts_insert_tenant_admin
  ON public.email_accounts FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY email_accounts_update_tenant_admin
  ON public.email_accounts FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY email_accounts_delete_tenant_admin
  ON public.email_accounts FOR DELETE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

-- ============================================================================
-- EMAIL OUTBOX: persistent queue + send history (mini "sent items")
-- ============================================================================

CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL,
  email_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,

  to_email text NOT NULL,
  cc text[],
  bcc text[],
  reply_to text,
  from_name text,
  from_email text,

  subject text NOT NULL,
  html text,
  text_body text,

  category text NOT NULL DEFAULT 'transactional'
    CHECK (category IN ('auth','order','invite','transactional','manual','system')),
  related_type text,
  related_id uuid,

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','dlq','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,

  locked_at timestamptz,
  locked_by text,

  error_message text,
  message_id text,

  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,

  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_email_outbox_status_next ON public.email_outbox(status, next_attempt_at)
  WHERE status IN ('queued','sending');
CREATE INDEX idx_email_outbox_tenant ON public.email_outbox(tenant_id, queued_at DESC);
CREATE INDEX idx_email_outbox_branch ON public.email_outbox(branch_id, queued_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_email_outbox_to ON public.email_outbox(to_email);
CREATE INDEX idx_email_outbox_related ON public.email_outbox(related_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX idx_email_outbox_category ON public.email_outbox(category);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- Tenant staff (owners, admins, sales, accounts, production) can read tenant mail
CREATE POLICY email_outbox_select_staff
  ON public.email_outbox FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND app_id IS NOT NULL
    AND public.user_is_staff_for(app_id, tenant_id)
  );

-- Branch staff can read mail tied to their branch
CREATE POLICY email_outbox_select_branch
  ON public.email_outbox FOR SELECT TO authenticated
  USING (
    branch_id IS NOT NULL
    AND branch_id = public.user_branch_id()
  );

-- Customers can see emails on orders they can see
CREATE POLICY email_outbox_select_customer
  ON public.email_outbox FOR SELECT TO authenticated
  USING (
    related_type = 'order'
    AND related_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = email_outbox.related_id
        AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
    )
  );

-- Tenant admins can cancel queued emails
CREATE POLICY email_outbox_update_tenant_admin
  ON public.email_outbox FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id)
  );

-- ============================================================================
-- MIGRATE legacy email_log -> email_outbox, then drop email_log
-- ============================================================================

INSERT INTO public.email_outbox (
  tenant_id, app_id, to_email, subject, category,
  related_type, related_id, status, error_message,
  queued_at, sent_at, metadata
)
SELECT
  el.tenant_id,
  el.app_id,
  el.recipient_email,
  el.subject,
  CASE
    WHEN el.event_key LIKE 'order%' THEN 'order'
    WHEN el.event_key LIKE 'invite%' THEN 'invite'
    WHEN el.event_key LIKE 'auth%' THEN 'auth'
    ELSE 'transactional'
  END,
  CASE WHEN el.order_id IS NOT NULL THEN 'order' ELSE NULL END,
  el.order_id,
  CASE
    WHEN el.status = 'sent' THEN 'sent'
    WHEN el.status = 'failed' THEN 'failed'
    ELSE 'sent'
  END,
  el.error_message,
  el.sent_at,
  CASE WHEN el.status = 'sent' THEN el.sent_at ELSE NULL END,
  jsonb_build_object('event_key', el.event_key, 'imported_from', 'email_log') || COALESCE(el.metadata, '{}'::jsonb)
FROM public.email_log el;

DROP TABLE public.email_log;

-- ============================================================================
-- TENANT SETTING: opt-in platform SMTP fallback
-- ============================================================================

INSERT INTO public.tenant_settings (tenant_id, category, setting_key, setting_value)
SELECT t.id, 'email', 'enable_platform_smtp_fallback', 'true'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_settings ts
  WHERE ts.tenant_id = t.id
    AND ts.category = 'email'
    AND ts.setting_key = 'enable_platform_smtp_fallback'
)
ON CONFLICT DO NOTHING;