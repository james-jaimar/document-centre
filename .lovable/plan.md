## Goal

Let an opted-in tenant (the international demo store) sell in USD, CAD, GBP, EUR, AUD and ZAR. Visitors are geolocated to a currency, can override it with a header picker, and the order, invoice and payment are stamped in the currency they chose.

## What's already there (verified)

- `platform_pricing_regions` holds 5 regions: US (US, CA → USD), UK (GBP, currently the default), EU (20 countries → EUR), AU (AU, NZ → AUD), ZA (ZAR).
- `pricing_currency_profiles` already stores `fx_from_zar`, `buying_power_mult`, `rounding_step`, `min_value` and `symbol` for ZAR/GBP/EUR/USD/AUD — but **no application code reads it today**.
- `pricing_rules` are already duplicated per currency (61 rules × 5 currencies), and `product_price_overrides` is currency-aware.
- `useRegionalPricing` is already the single currency source for the whole storefront (cart, checkout, price summary, option selectors, photo prints, order build), and it currently forces the tenant's locked currency.
- Checkout already hides PayFast when the currency isn't ZAR, and `orders.currency`, `payments.currency`, `order_invoices.currency` all exist.
- `CountryFlagBadge` exists in the header behind `tenants.show_country_selector`, but selecting a country is a deliberate no-op.

**Gap:** the rate-card tables (`rate_card_business_cards`, `rate_card_photo_prints`, `rate_card_canvas_prints`, `rate_card_clicks`, `catalog_paper_prices`, `catalog_finishing_prices`, pack-pricing overrides, canvas wrap surcharges) have **no currency column** — they are all ZAR-base. Those are the prices that need the FX multiplier.

## Plan

### 1. Currency data

- Add a `CA` region (`CAD`, `C$`, countries `["CA"]`) and remove `CA` from the US region; add a `CAD` row to `pricing_currency_profiles` (FX + buying-power multiplier + rounding).
- Add a `rest_of_world` flag on one region (USD) so unmatched countries fall back to USD rather than the `is_default` region.
- Extend the fallback rules: geolocation match → region; no match → rest-of-world (USD); tenant not opted in → tenant base currency.

### 2. Tenant opt-in

In **Admin → Settings → Financial**, next to the existing "Lock to this currency" switch, add:
- "Sell in multiple currencies" (off by default; turning it on implies unlocking).
- A checkbox list of which currencies the tenant accepts (ZAR, USD, CAD, GBP, EUR, AUD).
- Base currency stays the existing `default_currency_code` — it is the currency the rate cards are entered in.

Stored as `tenant_settings` keys in the `financial` category (`multi_currency_enabled`, `accepted_currencies`). Existing tenants keep `lock_currency = true` and see no change.

### 3. Conversion engine

New `src/lib/pricing/convertCurrency.ts`:

```text
display = round_up_to_step(
  base_amount_in_ZAR × fx_from_zar × buying_power_mult,
  rounding_step,
  min_value
)
```

- Loaded once per session from `pricing_currency_profiles` via a `useCurrencyProfiles` hook, cached in React Query.
- Applied to every price read from a currency-less rate-card table. Prices from `pricing_rules` / `product_price_overrides` keep using the native per-currency row when one exists, and only fall back to conversion when it doesn't.
- Non-ZAR base tenants: convert via ZAR as the pivot (`amount / fx_from_base × fx_from_target`).
- Same helper runs server-side (a copy under `supabase/functions/_shared/`) so the `order-engine` quote path produces identical figures — the client never dictates the price.

### 4. Picker + geolocation

- `useRegionalPricing`: when the tenant is multi-currency, restrict `regions` to the accepted list, keep the existing `detect-region` geolocation call and `localStorage` override, and stop short-circuiting on the tenant lock.
- Rewrite `CountryFlagBadge` into a real currency/country switcher: shows the active flag plus the currency code, lists the tenant's accepted currencies, and calls `setRegion` on select. Show a one-time toast when geolocation picks a currency ("Showing prices in USD — change any time").
- Warn and clear the cart (with confirmation) if the currency changes while items are in the basket, since line prices are currency-stamped.

### 5. Checkout, orders and gateways

- `Checkout.tsx` already reads `currency` from the cart/region; extend the gateway filter so each provider only offers the currencies it supports (PayFast → ZAR only; Stripe → all six). If no gateway supports the selected currency, fall back to EFT / manual and say why.
- Pass the selected currency through `createOrderWithJobs` so `orders.currency`, `order_pricing_snapshots.currency`, the proforma and the tax invoice all carry it — the snapshot keeps the order immutable at the converted figures.
- Pass the currency to the Stripe session so the customer is actually charged in it.
- `delivery_rates` is already currency-aware; where a rate is missing for the selected currency, convert from the ZAR rate with the same helper.

### 6. Display

`formatCurrency.ts` gains `CAD → en-CA`. Everything else already formats from the currency code, so no per-component changes.

## Technical notes

- One migration: `CA` region row, US region country list, `CAD` profile row, plus the region `is_rest_of_world` column.
- FX rates stay admin-editable in **Platform → Master Pricing** (new "Currencies" tab: rate, buying-power multiplier, rounding step, notes). No automatic FX feed in this pass — rates are manual, with the `updated_at` timestamp surfaced so staleness is visible.
- Rounding is always *up* to the step, so conversion never undercuts the base price.
- Risk to flag: any tenant that switches on multi-currency should re-check their canvas/photo/business-card rate cards, because those prices are derived, not authored, in the non-base currencies.
