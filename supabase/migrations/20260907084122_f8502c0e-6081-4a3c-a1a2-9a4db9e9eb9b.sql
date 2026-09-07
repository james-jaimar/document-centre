CREATE TABLE public.stock_image_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  order_item_id uuid,
  placeholder_id uuid,
  provider text NOT NULL DEFAULT 'pexels',
  photo_id text NOT NULL,
  photographer text,
  photographer_url text,
  photo_url text,
  storage_path text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_image_uses TO authenticated;
GRANT ALL ON public.stock_image_uses TO service_role;

ALTER TABLE public.stock_image_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_image_uses_insert_own"
  ON public.stock_image_uses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "stock_image_uses_select_own_or_tenant"
  ON public.stock_image_uses FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.tenant_id = stock_image_uses.tenant_id
    )
  );

CREATE INDEX idx_stock_image_uses_order_item ON public.stock_image_uses (order_item_id);