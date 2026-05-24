
-- Status enum
CREATE TYPE public.quote_status AS ENUM (
  'active','expired','approved','declined','converted','void'
);

-- Parent quote
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NULL,

  quote_number text NOT NULL UNIQUE,
  name text NULL,

  customer_profile_id uuid NOT NULL,
  customer_email text NULL,
  customer_name text NULL,
  company_name text NULL,
  created_by_profile_id uuid NULL,
  created_via text NOT NULL DEFAULT 'customer'
    CHECK (created_via IN ('customer','sales')),

  source_order_id uuid NULL,
  converted_order_id uuid NULL,

  quote_status public.quote_status NOT NULL DEFAULT 'active',

  valid_until timestamptz NOT NULL,
  expired_at timestamptz NULL,
  approved_at timestamptz NULL,
  declined_at timestamptz NULL,
  converted_at timestamptz NULL,

  notes_for_customer text NULL,
  notes_internal text NULL,
  email_recipients text[] NOT NULL DEFAULT '{}',
  pdf_storage_path text NULL,
  pdf_generated_at timestamptz NULL,
  current_revision_no integer NOT NULL DEFAULT 1,

  currency text NOT NULL DEFAULT 'ZAR',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_amount numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_tenant_status ON public.quotes(tenant_id, quote_status);
CREATE INDEX idx_quotes_customer ON public.quotes(customer_profile_id);
CREATE INDEX idx_quotes_branch ON public.quotes(branch_id);
CREATE INDEX idx_quotes_valid_until ON public.quotes(valid_until) WHERE quote_status = 'active';

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  sequence_no integer NOT NULL DEFAULT 1,
  source_job_id uuid NULL,
  product_family_id uuid NULL,
  external_product_key text NULL,
  product_name text NOT NULL,
  product_category text NULL,
  job_name text NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_label text NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  net_price numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 15,
  gross_price numeric(12,2) NOT NULL DEFAULT 0,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);

CREATE TABLE public.quote_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  changed_by_profile_id uuid NULL,
  change_reason text NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, revision_no)
);
CREATE INDEX idx_quote_revisions_quote ON public.quote_revisions(quote_id);

CREATE TABLE public.quote_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  quote_item_id uuid NULL REFERENCES public.quote_items(id) ON DELETE CASCADE,
  source_order_document_id uuid NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'documents',
  storage_path text NOT NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_documents_quote ON public.quote_documents(quote_id);

-- Quote number sequence per app
INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
SELECT id, 'quote', 'Q', 0
FROM public.apps
WHERE NOT EXISTS (
  SELECT 1 FROM public.number_sequences ns
  WHERE ns.app_id = apps.id AND ns.sequence_type = 'quote'
);

CREATE OR REPLACE FUNCTION public.generate_quote_number(p_app_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_prefix text; v_num bigint;
BEGIN
  SELECT prefix INTO v_prefix FROM public.number_sequences
  WHERE app_id = p_app_id AND sequence_type = 'quote';
  IF v_prefix IS NULL THEN
    INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
    VALUES (p_app_id, 'quote', 'Q', 0) ON CONFLICT DO NOTHING;
    v_prefix := 'Q';
  END IF;
  v_num := public.next_number(p_app_id, 'quote');
  RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
END;
$fn$;

-- RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
  OR (customer_profile_id = auth.uid()
      AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id))
);

CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
  OR (customer_profile_id = auth.uid()
      AND public.user_has_membership(app_id, tenant_id)
      AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id))
);

CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
  OR (customer_profile_id = auth.uid()
      AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
  OR (customer_profile_id = auth.uid()
      AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id))
);

CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
);

CREATE POLICY "quote_items_all" ON public.quote_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
));

CREATE POLICY "quote_revisions_select" ON public.quote_revisions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_revisions.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
));

CREATE POLICY "quote_revisions_insert" ON public.quote_revisions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_revisions.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
));

CREATE POLICY "quote_documents_all" ON public.quote_documents FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_documents.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.quotes q WHERE q.id = quote_documents.quote_id
    AND (public.has_role(auth.uid(), 'platform_admin'::app_role)
         OR public.user_is_staff_for(q.app_id, q.tenant_id)
         OR q.customer_profile_id = auth.uid())
));
