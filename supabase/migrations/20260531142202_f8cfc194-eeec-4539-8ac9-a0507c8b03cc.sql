-- Customer portal expansion: PO numbers, favourite branch, saved order templates

-- 1) PO number + cost centre on orders (optional B2B fields)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS cost_centre text;

-- 2) Favourite branch per profile (auto-select on storefront load)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favourite_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- 3) Saved order templates ("re-print library")
CREATE TABLE IF NOT EXISTS public.customer_saved_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  app_id uuid NOT NULL,
  branch_id uuid,
  name text NOT NULL,
  notes text,
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_saved_orders_owner
  ON public.customer_saved_orders(profile_id, tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_orders TO authenticated;
GRANT ALL ON public.customer_saved_orders TO service_role;

ALTER TABLE public.customer_saved_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_saved_orders_owner_all
  ON public.customer_saved_orders
  FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY customer_saved_orders_staff_read
  ON public.customer_saved_orders
  FOR SELECT
  TO authenticated
  USING (public.user_is_staff_for(app_id, tenant_id));

CREATE TRIGGER trg_customer_saved_orders_updated
  BEFORE UPDATE ON public.customer_saved_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();