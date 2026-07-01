
-- ============ branch_discounts ============
CREATE TABLE public.branch_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('coupon','voucher','automatic')),
  code text,
  name text NOT NULL,
  description text,
  value_type text NOT NULL CHECK (value_type IN ('percentage','fixed','free_delivery','free_item')),
  value_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'ZAR',
  free_item_ref jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  max_per_customer integer,
  min_order_subtotal numeric(12,2),
  first_time_customer_only boolean NOT NULL DEFAULT false,
  allow_combine_with_code boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX branch_discounts_code_unique
  ON public.branch_discounts (branch_id, lower(code))
  WHERE code IS NOT NULL;
CREATE INDEX branch_discounts_branch_active_idx
  ON public.branch_discounts (branch_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_discounts TO authenticated;
GRANT ALL ON public.branch_discounts TO service_role;
ALTER TABLE public.branch_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_discounts_read_staff"
  ON public.branch_discounts FOR SELECT TO authenticated
  USING (public.caller_has_branch_access(branch_id) OR public.user_can_manage_branch(branch_id));

CREATE POLICY "branch_discounts_write_managers"
  ON public.branch_discounts FOR ALL TO authenticated
  USING (public.user_can_manage_branch(branch_id))
  WITH CHECK (public.user_can_manage_branch(branch_id));

CREATE TRIGGER trg_branch_discounts_updated
  BEFORE UPDATE ON public.branch_discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ branch_discount_products ============
CREATE TABLE public.branch_discount_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id uuid NOT NULL REFERENCES public.branch_discounts(id) ON DELETE CASCADE,
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_id, product_family_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_discount_products TO authenticated;
GRANT ALL ON public.branch_discount_products TO service_role;
ALTER TABLE public.branch_discount_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_discount_products_read"
  ON public.branch_discount_products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id
    AND (public.caller_has_branch_access(d.branch_id) OR public.user_can_manage_branch(d.branch_id))));

CREATE POLICY "branch_discount_products_write"
  ON public.branch_discount_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id AND public.user_can_manage_branch(d.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id AND public.user_can_manage_branch(d.branch_id)));

-- ============ branch_discount_customers ============
CREATE TABLE public.branch_discount_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id uuid NOT NULL REFERENCES public.branch_discounts(id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_user_id IS NOT NULL OR customer_email IS NOT NULL)
);
CREATE INDEX branch_discount_customers_discount_idx ON public.branch_discount_customers(discount_id);
CREATE INDEX branch_discount_customers_email_idx ON public.branch_discount_customers(lower(customer_email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_discount_customers TO authenticated;
GRANT ALL ON public.branch_discount_customers TO service_role;
ALTER TABLE public.branch_discount_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_discount_customers_read"
  ON public.branch_discount_customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id
    AND (public.caller_has_branch_access(d.branch_id) OR public.user_can_manage_branch(d.branch_id))));

CREATE POLICY "branch_discount_customers_write"
  ON public.branch_discount_customers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id AND public.user_can_manage_branch(d.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.branch_discounts d WHERE d.id = discount_id AND public.user_can_manage_branch(d.branch_id)));

-- ============ branch_discount_redemptions ============
CREATE TABLE public.branch_discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id uuid NOT NULL REFERENCES public.branch_discounts(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text,
  amount_applied numeric(12,2) NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_id, order_id)
);
CREATE INDEX bdr_discount_idx ON public.branch_discount_redemptions(discount_id);
CREATE INDEX bdr_order_idx ON public.branch_discount_redemptions(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_discount_redemptions TO authenticated;
GRANT ALL ON public.branch_discount_redemptions TO service_role;
ALTER TABLE public.branch_discount_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bdr_read_staff"
  ON public.branch_discount_redemptions FOR SELECT TO authenticated
  USING (public.caller_has_branch_access(branch_id) OR public.user_can_manage_branch(branch_id));

CREATE POLICY "bdr_read_own_customer"
  ON public.branch_discount_redemptions FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

-- ============ orders: promo columns ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_snapshot jsonb;
