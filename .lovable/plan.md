## What I verified

- Demo tenant settings are already correct: `default_currency_code = GBP`, `lock_currency = false`, `multi_currency_enabled = true`, `accepted_currencies = [GBP, ZAR, USD, AUD, CAD, EUR]`.
- All six regions exist (US/rest-of-world, UK, EU, AU, ZA, CA) and all six currency profiles exist with FX + buying-power multipliers.
- `tenant_settings` has **no read policy for shoppers**. SELECT is limited to tenant admins and platform admins (plus a public read for `category = 'branding'` only). `useRegionalPricing` reads `tenant_settings` directly, so on the storefront it gets **zero rows** → it falls back to the hardcoded `"ZAR"` default with `locked = true`, which also hides the picker (`multiCurrency` is false). That is exactly the "stuck on ZAR, changing settings does nothing" symptom.
- `pricing_currency_profiles` has SELECT for `authenticated` only, so the FX table is empty for a truly anonymous visitor — conversion silently returns the base amount.
- Secondary bug: `useRegionalPricing` returns `baseCurrency = default_currency_code` (GBP for demo), but rate cards are authored in ZAR. Conversion would run GBP→ZAR→target and produce wrong prices.
- Minor: the Canada region's `region_code` is stored lowercase `ca` while others are uppercase.

## Plan

**1. Make currency policy readable on the storefront**

Read the four financial settings through the existing `SECURITY DEFINER` RPC `resolve_tenant_setting` (the same pattern `useLegalDocument` uses) instead of selecting from `tenant_settings`. Four RPC calls in parallel: `default_currency_code`, `lock_currency`, `multi_currency_enabled`, `accepted_currencies`, all under `category = 'financial'`.

**2. Grant anon read on the FX table**

Migration: `GRANT SELECT ON public.pricing_currency_profiles TO anon` plus an anon SELECT policy (FX rates are non-sensitive public pricing data). Same check for `platform_pricing_regions` (already anon-readable).

**3. Fix the FX base currency**

Rate cards are authored in **ZAR**. Stop using the tenant's display default as the conversion base — use ZAR (the pivot) as the rate-card base everywhere the converter is built (`useRegionalPricing.baseCurrency`, `PriceSummary`, `useItemPricing`, canvas/photo builders, `quoteShipping`). The tenant's `default_currency_code` keeps its real job: the default *display* currency when geo detection fails or is not applicable.

**4. Detection + picker behaviour on the demo storefront**

- With multi-currency on, `detect-region` runs, the country maps to a region, and unmatched countries fall through to the rest-of-world USD region (already coded, just never reached because of the RLS block).
- Manual choice persists in `localStorage` and wins over geo.
- Normalise the Canada `region_code` to uppercase `CA` so overrides and flags match the other regions.

**5. Verify end to end**

Drive the demo storefront headlessly: confirm the picker appears, confirm the default currency, switch US → GBP → EUR and check a product price and the cart/checkout total change by the expected FX + buying-power factor (not just the symbol).

## Technical notes

- No changes to how prices are stored. `pricing_rules`, `product_price_overrides` and `delivery_rates` stay native-per-currency and are never converted; only rate-card style tables (clicks, papers, finishing, pack, photo, canvas, business cards) go through `convertAmount`.
- Rounding stays "round up to the currency's step", so a conversion never undercuts the ZAR base.
- Locked single-currency tenants (e.g. PostNet, ZAR-locked) are unaffected — they keep no picker and no conversion.
