-- 1) Add currency_code to pricing_rules
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'ZAR';

CREATE INDEX IF NOT EXISTS idx_pricing_rules_family_currency
  ON public.pricing_rules (product_family_id, currency_code, sort_order);

-- 2) Currency profiles table
CREATE TABLE IF NOT EXISTS public.pricing_currency_profiles (
  currency_code text PRIMARY KEY,
  fx_from_zar numeric(12, 6) NOT NULL,
  buying_power_mult numeric(6, 3) NOT NULL DEFAULT 1.000,
  rounding_step numeric(8, 4) NOT NULL DEFAULT 0.0100,
  min_value numeric(8, 4) NOT NULL DEFAULT 0.0100,
  symbol text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_currency_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_currency_profiles_select_all ON public.pricing_currency_profiles;
CREATE POLICY pricing_currency_profiles_select_all
  ON public.pricing_currency_profiles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS pricing_currency_profiles_modify_platform_admin ON public.pricing_currency_profiles;
CREATE POLICY pricing_currency_profiles_modify_platform_admin
  ON public.pricing_currency_profiles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER pricing_currency_profiles_updated_at
  BEFORE UPDATE ON public.pricing_currency_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Seed currency profiles (FX from ZAR base ≈ April 2026)
--    fx_from_zar = how many target-currency units per 1 ZAR
--    buying_power_mult = local-market premium/discount on top of FX
INSERT INTO public.pricing_currency_profiles
  (currency_code, fx_from_zar, buying_power_mult, rounding_step, min_value, symbol, notes)
VALUES
  ('ZAR', 1.000000, 1.000, 0.0500, 0.0500, 'R',  'Source of truth — never derived'),
  ('GBP', 0.044700, 1.150, 0.0100, 0.0100, '£',  'UK retail print band: BachelorPrint £0.10–0.20/page colour'),
  ('EUR', 0.052600, 1.200, 0.0100, 0.0100, '€',  'EU tracks UK +5–10%'),
  ('USD', 0.059500, 1.350, 0.0100, 0.0100, '$',  'US retail print premium ($0.49–0.79/page colour at retail)'),
  ('AUD', 0.090900, 1.200, 0.0100, 0.0100, 'A$', 'Australian retail premium (Officeworks-style)')
ON CONFLICT (currency_code) DO UPDATE
SET fx_from_zar = EXCLUDED.fx_from_zar,
    buying_power_mult = EXCLUDED.buying_power_mult,
    rounding_step = EXCLUDED.rounding_step,
    min_value = EXCLUDED.min_value,
    symbol = EXCLUDED.symbol,
    notes = EXCLUDED.notes,
    updated_at = now();

-- 4) Regenerator function: wipes non-ZAR rules for the target and re-derives from ZAR.
--    Volume-discount surcharges with negative price_value get the same transform
--    (sign preserved). Rounding uses the profile's rounding_step. Minimum absolute
--    value enforced via min_value (positive prices clamped up; negatives left as-is).
CREATE OR REPLACE FUNCTION public.regenerate_pricing_rules_for_currency(p_currency text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.pricing_currency_profiles;
  v_inserted integer := 0;
BEGIN
  IF p_currency = 'ZAR' THEN
    RAISE EXCEPTION 'Cannot regenerate ZAR rules — ZAR is the source of truth';
  END IF;

  SELECT * INTO v_profile
  FROM public.pricing_currency_profiles
  WHERE currency_code = p_currency;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No currency profile for %', p_currency;
  END IF;

  -- Wipe existing rows for this currency
  DELETE FROM public.pricing_rules WHERE currency_code = p_currency;

  -- Clone ZAR rules into the target currency, transforming price_value
  INSERT INTO public.pricing_rules (
    tenant_id, branch_id, product_family_id, name, rule_type, conditions,
    price_value, is_active, sort_order, currency_code
  )
  SELECT
    tenant_id, branch_id, product_family_id, name, rule_type, conditions,
    -- Transform: ZAR × fx × multiplier → round to step → enforce min for positives
    CASE
      WHEN price_value >= 0 THEN
        GREATEST(
          v_profile.min_value,
          round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
        )
      ELSE
        round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
    END AS price_value,
    is_active, sort_order, p_currency
  FROM public.pricing_rules
  WHERE currency_code = 'ZAR';

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_pricing_rules_for_currency(text) FROM public;
GRANT EXECUTE ON FUNCTION public.regenerate_pricing_rules_for_currency(text) TO authenticated;

-- Lock the function down to platform admins via SECURITY DEFINER + a guard
CREATE OR REPLACE FUNCTION public.regenerate_pricing_rules_for_currency(p_currency text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.pricing_currency_profiles;
  v_inserted integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Only platform admins can regenerate pricing rules';
  END IF;

  IF p_currency = 'ZAR' THEN
    RAISE EXCEPTION 'Cannot regenerate ZAR rules — ZAR is the source of truth';
  END IF;

  SELECT * INTO v_profile
  FROM public.pricing_currency_profiles
  WHERE currency_code = p_currency;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No currency profile for %', p_currency;
  END IF;

  DELETE FROM public.pricing_rules WHERE currency_code = p_currency;

  INSERT INTO public.pricing_rules (
    tenant_id, branch_id, product_family_id, name, rule_type, conditions,
    price_value, is_active, sort_order, currency_code
  )
  SELECT
    tenant_id, branch_id, product_family_id, name, rule_type, conditions,
    CASE
      WHEN price_value >= 0 THEN
        GREATEST(
          v_profile.min_value,
          round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
        )
      ELSE
        round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
    END,
    is_active, sort_order, p_currency
  FROM public.pricing_rules
  WHERE currency_code = 'ZAR';

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 5) Seed: regenerate all four non-ZAR currency variants from the existing ZAR rules.
--    We bypass the auth guard for the initial seed by inlining the logic with a
--    DO block (auth.uid() is null during migrations).
DO $$
DECLARE
  v_curr text;
  v_profile public.pricing_currency_profiles;
BEGIN
  FOR v_curr IN SELECT currency_code FROM public.pricing_currency_profiles WHERE currency_code <> 'ZAR' LOOP
    SELECT * INTO v_profile FROM public.pricing_currency_profiles WHERE currency_code = v_curr;

    DELETE FROM public.pricing_rules WHERE currency_code = v_curr;

    INSERT INTO public.pricing_rules (
      tenant_id, branch_id, product_family_id, name, rule_type, conditions,
      price_value, is_active, sort_order, currency_code
    )
    SELECT
      tenant_id, branch_id, product_family_id, name, rule_type, conditions,
      CASE
        WHEN price_value >= 0 THEN
          GREATEST(
            v_profile.min_value,
            round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
          )
        ELSE
          round((price_value * v_profile.fx_from_zar * v_profile.buying_power_mult) / v_profile.rounding_step) * v_profile.rounding_step
      END,
      is_active, sort_order, v_curr
    FROM public.pricing_rules
    WHERE currency_code = 'ZAR';
  END LOOP;
END $$;