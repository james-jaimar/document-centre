GRANT SELECT ON public.product_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product categories are publicly readable" ON public.product_categories;
CREATE POLICY "Product categories are publicly readable"
ON public.product_categories FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Platform admins manage product categories" ON public.product_categories;
CREATE POLICY "Platform admins manage product categories"
ON public.product_categories FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));