
-- Pack pricing override table (tenant + branch scope)
CREATE TABLE public.product_pack_pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- One override row per family per scope. NULL branch_id = tenant-wide override.
CREATE UNIQUE INDEX product_pack_pricing_overrides_uniq_tenant
  ON public.product_pack_pricing_overrides (product_family_id, tenant_id)
  WHERE branch_id IS NULL;
CREATE UNIQUE INDEX product_pack_pricing_overrides_uniq_branch
  ON public.product_pack_pricing_overrides (product_family_id, tenant_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX product_pack_pricing_overrides_family_idx
  ON public.product_pack_pricing_overrides (product_family_id);
CREATE INDEX product_pack_pricing_overrides_tenant_idx
  ON public.product_pack_pricing_overrides (tenant_id);
CREATE INDEX product_pack_pricing_overrides_branch_idx
  ON public.product_pack_pricing_overrides (branch_id);

-- Reuse the same validation shape as product_families.quantity_blocks
CREATE OR REPLACE FUNCTION public.validate_pack_pricing_override_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  elem jsonb;
BEGIN
  IF NEW.quantity_blocks IS NULL THEN
    NEW.quantity_blocks := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(NEW.quantity_blocks) <> 'array' THEN
    RAISE EXCEPTION 'quantity_blocks must be a JSON array';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(NEW.quantity_blocks) LOOP
    IF NOT (elem ? 'size' AND elem ? 'paper' AND elem ? 'sides'
            AND elem ? 'qty' AND elem ? 'price_minor') THEN
      RAISE EXCEPTION
        'Each quantity_blocks row must include size, paper, sides, qty, price_minor (got %)',
        elem;
    END IF;
    IF (elem->>'sides') NOT IN ('single', 'double') THEN
      RAISE EXCEPTION 'quantity_blocks.sides must be "single" or "double" (got %)', elem->>'sides';
    END IF;
    IF (elem->>'qty')::int < 1 THEN
      RAISE EXCEPTION 'quantity_blocks.qty must be >= 1 (got %)', elem->>'qty';
    END IF;
    IF (elem->>'price_minor')::int < 0 THEN
      RAISE EXCEPTION 'quantity_blocks.price_minor must be >= 0 (got %)', elem->>'price_minor';
    END IF;
  END LOOP;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_pack_pricing_override_blocks
BEFORE INSERT OR UPDATE ON public.product_pack_pricing_overrides
FOR EACH ROW EXECUTE FUNCTION public.validate_pack_pricing_override_blocks();

-- Grants (auth-only writes; anon reads gated to storefront tenant via RLS)
GRANT SELECT ON public.product_pack_pricing_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_pack_pricing_overrides TO authenticated;
GRANT ALL ON public.product_pack_pricing_overrides TO service_role;

ALTER TABLE public.product_pack_pricing_overrides ENABLE ROW LEVEL SECURITY;

-- Storefront anon can read override rows for the current storefront tenant
CREATE POLICY "pack_pricing_overrides_storefront_read"
ON public.product_pack_pricing_overrides
FOR SELECT
TO anon, authenticated
USING (
  public.current_storefront_tenant_id() IS NOT NULL
  AND tenant_id = public.current_storefront_tenant_id()
);

-- Authenticated users can read override rows for tenants they belong to
CREATE POLICY "pack_pricing_overrides_member_read"
ON public.product_pack_pricing_overrides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = product_pack_pricing_overrides.tenant_id
      AND tm.is_active = true
  )
);

-- Tenant admins (owner/admin) can manage tenant-wide override rows (branch_id NULL)
CREATE POLICY "pack_pricing_overrides_tenant_admin_write"
ON public.product_pack_pricing_overrides
FOR ALL
TO authenticated
USING (
  branch_id IS NULL
  AND public.user_is_tenant_admin(tenant_id)
)
WITH CHECK (
  branch_id IS NULL
  AND public.user_is_tenant_admin(tenant_id)
);

-- Branch rows: tenant admins OR branch managers of that branch can manage
CREATE POLICY "pack_pricing_overrides_branch_write"
ON public.product_pack_pricing_overrides
FOR ALL
TO authenticated
USING (
  branch_id IS NOT NULL
  AND (
    public.user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = product_pack_pricing_overrides.tenant_id
        AND tm.branch_id = product_pack_pricing_overrides.branch_id
        AND tm.is_active = true
        AND tm.role IN ('branch_manager', 'admin', 'owner')
    )
  )
)
WITH CHECK (
  branch_id IS NOT NULL
  AND (
    public.user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = product_pack_pricing_overrides.tenant_id
        AND tm.branch_id = product_pack_pricing_overrides.branch_id
        AND tm.is_active = true
        AND tm.role IN ('branch_manager', 'admin', 'owner')
    )
  )
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_pack_pricing_overrides;
