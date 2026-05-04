-- Allow anonymous (guest) users to read active tenants (needed for storefront slug resolution)
CREATE POLICY "tenants_public_read_active"
ON public.tenants FOR SELECT TO anon
USING (is_active = true);

-- Allow anonymous users to read active product families (needed for product tile grid)
CREATE POLICY "product_families_public_read"
ON public.product_families FOR SELECT TO anon
USING (is_active = true);

-- Allow anonymous users to read active branches (needed for branch-scoped product filtering)
CREATE POLICY "branches_public_read"
ON public.branches FOR SELECT TO anon
USING (is_active = true);

-- Allow anonymous users to read product options (needed for order configurator)
CREATE POLICY "product_options_public_read"
ON public.product_options FOR SELECT TO anon
USING (true);

-- Allow anonymous users to read pricing rules (needed to display prices)
CREATE POLICY "pricing_rules_public_read"
ON public.pricing_rules FOR SELECT TO anon
USING (true);

-- Allow anonymous users to read binding specifications (needed for configurator)
CREATE POLICY "binding_specs_public_read"
ON public.binding_specifications FOR SELECT TO anon
USING (true);

-- Allow anonymous users to read branch capabilities (needed for product availability)
CREATE POLICY "branch_capabilities_public_read"
ON public.branch_capabilities FOR SELECT TO anon
USING (is_enabled = true);