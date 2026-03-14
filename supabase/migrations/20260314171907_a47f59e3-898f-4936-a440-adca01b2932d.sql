
-- Section type enum
CREATE TYPE public.section_type AS ENUM ('body', 'front_cover', 'back_cover', 'insert', 'tab');

-- Orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.branches(id),
  order_status public.order_status NOT NULL DEFAULT 'draft',
  total_price numeric NOT NULL DEFAULT 0,
  fulfillment_type public.fulfillment_type,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order items table
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_family_id uuid REFERENCES public.product_families(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  build_status public.build_status NOT NULL DEFAULT 'draft',
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents table
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text DEFAULT 'application/pdf',
  page_count integer,
  page_width_mm numeric,
  page_height_mm numeric,
  document_status public.document_status NOT NULL DEFAULT 'pending',
  preflight_data jsonb DEFAULT '{}'::jsonb,
  thumbnail_urls jsonb DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Document sections table
CREATE TABLE public.document_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  section_type public.section_type NOT NULL DEFAULT 'body',
  page_range_start integer,
  page_range_end integer,
  paper_stock text,
  paper_weight_gsm integer,
  is_color boolean NOT NULL DEFAULT true,
  is_duplex boolean NOT NULL DEFAULT true,
  lamination text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_document_sections_updated_at BEFORE UPDATE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('document-uploads', 'document-uploads', false);

-- RLS: Orders
CREATE POLICY "Users can manage own orders" ON public.orders FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Head office admins can view tenant orders" ON public.orders FOR SELECT
  USING (has_role(auth.uid(), 'head_office_admin') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Platform admins can manage all orders" ON public.orders FOR ALL
  USING (has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Branch managers can view branch orders" ON public.orders FOR SELECT
  USING (has_role(auth.uid(), 'branch_manager') AND tenant_id = get_user_tenant_id(auth.uid()));

-- RLS: Order items (via order ownership)
CREATE POLICY "Users can manage own order items" ON public.order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));

CREATE POLICY "Head office admins can view tenant order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND has_role(auth.uid(), 'head_office_admin') AND o.tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY "Platform admins can manage all order items" ON public.order_items FOR ALL
  USING (has_role(auth.uid(), 'platform_admin'));

-- RLS: Documents (via order item → order ownership)
CREATE POLICY "Users can manage own documents" ON public.documents FOR ALL
  USING (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = documents.order_item_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = documents.order_item_id AND o.user_id = auth.uid()));

CREATE POLICY "Platform admins can manage all documents" ON public.documents FOR ALL
  USING (has_role(auth.uid(), 'platform_admin'));

-- RLS: Document sections (via order item → order ownership)
CREATE POLICY "Users can manage own document sections" ON public.document_sections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = document_sections.order_item_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = document_sections.order_item_id AND o.user_id = auth.uid()));

CREATE POLICY "Platform admins can manage all document sections" ON public.document_sections FOR ALL
  USING (has_role(auth.uid(), 'platform_admin'));

-- Storage RLS: document-uploads bucket
CREATE POLICY "Users can upload own documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'document-uploads' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can view own documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'document-uploads' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'document-uploads' AND auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage all uploads" ON storage.objects FOR ALL
  USING (bucket_id = 'document-uploads' AND has_role(auth.uid(), 'platform_admin'));
