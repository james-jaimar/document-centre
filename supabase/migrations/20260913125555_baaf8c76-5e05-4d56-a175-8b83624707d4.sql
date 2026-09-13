
-- 1. supplier_links
CREATE TABLE public.supplier_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  buyer_tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  buyer_company_id uuid REFERENCES public.customer_companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'invited',
  invite_code text NOT NULL UNIQUE,
  invite_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_links_status_chk CHECK (status IN ('invited','active','revoked')),
  CONSTRAINT supplier_links_no_self CHECK (buyer_tenant_id IS NULL OR buyer_tenant_id <> supplier_tenant_id)
);
CREATE UNIQUE INDEX supplier_links_pair_uniq
  ON public.supplier_links (supplier_tenant_id, buyer_tenant_id)
  WHERE buyer_tenant_id IS NOT NULL AND status <> 'revoked';
CREATE INDEX supplier_links_buyer_idx ON public.supplier_links (buyer_tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_links TO authenticated;
GRANT ALL ON public.supplier_links TO service_role;
ALTER TABLE public.supplier_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_links_select ON public.supplier_links FOR SELECT TO authenticated
USING (public.user_is_tenant_admin(supplier_tenant_id) OR (buyer_tenant_id IS NOT NULL AND public.user_is_tenant_admin(buyer_tenant_id)));
CREATE POLICY supplier_links_insert ON public.supplier_links FOR INSERT TO authenticated
WITH CHECK (public.user_is_tenant_admin(supplier_tenant_id));
CREATE POLICY supplier_links_update ON public.supplier_links FOR UPDATE TO authenticated
USING (public.user_is_tenant_admin(supplier_tenant_id) OR (buyer_tenant_id IS NOT NULL AND public.user_is_tenant_admin(buyer_tenant_id)))
WITH CHECK (public.user_is_tenant_admin(supplier_tenant_id) OR (buyer_tenant_id IS NOT NULL AND public.user_is_tenant_admin(buyer_tenant_id)));
CREATE POLICY supplier_links_delete ON public.supplier_links FOR DELETE TO authenticated
USING (public.user_is_tenant_admin(supplier_tenant_id));
CREATE POLICY supplier_links_platform ON public.supplier_links FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TRIGGER supplier_links_touch BEFORE UPDATE ON public.supplier_links
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- helper: is there an active link between these tenants?
CREATE OR REPLACE FUNCTION public.supplier_link_is_active(p_supplier_tenant uuid, p_buyer_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_links
    WHERE supplier_tenant_id = p_supplier_tenant
      AND buyer_tenant_id = p_buyer_tenant
      AND status = 'active'
  );
$$;

-- helper: may the current user see this supplier's wholesale catalogue?
CREATE OR REPLACE FUNCTION public.user_can_view_supplier_catalogue(p_supplier_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_is_tenant_admin(p_supplier_tenant)
     OR EXISTS (
       SELECT 1 FROM public.supplier_links sl
       WHERE sl.supplier_tenant_id = p_supplier_tenant
         AND sl.status = 'active'
         AND sl.buyer_tenant_id IS NOT NULL
         AND public.user_is_tenant_admin(sl.buyer_tenant_id)
     );
$$;

-- 2. supplier_offerings
CREATE TABLE public.supplier_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  is_offered boolean NOT NULL DEFAULT true,
  lead_time_days integer,
  min_quantity integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_tenant_id, product_family_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_offerings TO authenticated;
GRANT ALL ON public.supplier_offerings TO service_role;
ALTER TABLE public.supplier_offerings ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_offerings_select ON public.supplier_offerings FOR SELECT TO authenticated
USING (public.user_can_view_supplier_catalogue(supplier_tenant_id));
CREATE POLICY supplier_offerings_write ON public.supplier_offerings FOR ALL TO authenticated
USING (public.user_is_tenant_admin(supplier_tenant_id))
WITH CHECK (public.user_is_tenant_admin(supplier_tenant_id));

CREATE TRIGGER supplier_offerings_touch BEFORE UPDATE ON public.supplier_offerings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. product_supplier_assignments
CREATE TABLE public.product_supplier_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  supplier_link_id uuid NOT NULL REFERENCES public.supplier_links(id) ON DELETE CASCADE,
  supplier_product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_family_id)
);
CREATE INDEX product_supplier_assignments_link_idx ON public.product_supplier_assignments (supplier_link_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_supplier_assignments TO authenticated;
GRANT ALL ON public.product_supplier_assignments TO service_role;
ALTER TABLE public.product_supplier_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY psa_select ON public.product_supplier_assignments FOR SELECT TO authenticated
USING (
  public.user_is_tenant_admin(tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.supplier_links sl
    WHERE sl.id = supplier_link_id AND public.user_is_tenant_admin(sl.supplier_tenant_id)
  )
);
CREATE POLICY psa_write ON public.product_supplier_assignments FOR ALL TO authenticated
USING (public.user_is_tenant_admin(tenant_id))
WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER psa_touch BEFORE UPDATE ON public.product_supplier_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. order linkage
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_link_id uuid REFERENCES public.supplier_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_status text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_order_uniq ON public.orders (source_order_id) WHERE source_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_supplier_order_idx ON public.orders (supplier_order_id) WHERE supplier_order_id IS NOT NULL;
