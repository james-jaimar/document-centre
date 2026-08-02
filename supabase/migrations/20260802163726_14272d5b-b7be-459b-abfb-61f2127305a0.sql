GRANT SELECT ON public.pricing_currency_profiles TO anon;
DROP POLICY IF EXISTS "pricing_currency_profiles_select_all" ON public.pricing_currency_profiles;
CREATE POLICY "pricing_currency_profiles_select_all"
  ON public.pricing_currency_profiles FOR SELECT
  TO anon, authenticated
  USING (true);