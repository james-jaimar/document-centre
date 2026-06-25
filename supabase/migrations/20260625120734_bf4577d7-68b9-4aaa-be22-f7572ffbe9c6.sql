CREATE POLICY bpg_storefront_read
  ON public.branch_payment_gateways
  FOR SELECT
  USING (
    current_storefront_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_payment_gateways.branch_id
        AND b.tenant_id = current_storefront_tenant_id()
    )
  );

GRANT SELECT ON public.branch_payment_gateways TO anon, authenticated;