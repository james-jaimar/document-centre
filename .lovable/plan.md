## Goal

Make the **demo product/print pricing** geo-aware across the 5 regions you already support for SaaS plans (ZA, UK, EU, US, AU), so customers visiting from each region see prices that look native and reflect realistic local print buying-power — not a naive FX conversion of ZAR.

The existing IP-detection from `useRegionalPricing` is reused; nothing new on the geolocation side.

---

## Research-derived multipliers

Applied on top of FX-converted ZAR base prices, then rounded to clean retail-friendly numbers:

| Region | FX (≈Apr 2026) | Buying-power multiplier | Effective vs ZA |
|---|---|---|---|
| **ZA** (ZAR) | 1.00 | 1.00× | baseline (current rules) |
| **UK** (GBP) | ÷ 22.35 | × 1.15 | UK retail print ~£0.10–0.20/page colour |
| **EU** (EUR) | ÷ 19.00 | × 1.20 | tracks UK +5–10% |
| **US** (USD) | ÷ 16.80 | × 1.35 | US retail print noticeably premium ($0.49–0.79/pg) |
| **AU** (AUD) | ÷ 11.00 | × 1.20 | Officeworks-style premium retail |

**Spot-check (current ZA: R1.30/page colour, R0.50 B&W, R15 setup):**
- UK: £0.067 → rounds to **£0.09 colour, £0.04 B&W, £0.99 setup** ✓ matches BachelorPrint band
- US: $0.105 → multiplied → rounds to **$0.14 colour, $0.05 B&W, $1.20 setup** (intentionally lower than Doxzoo-tier so demo looks competitive but not unrealistic)
- EU: €0.082 → **€0.10 colour, €0.04 B&W, €1.10 setup**
- AU: $0.142 → **$0.15 colour, $0.06 B&W, $1.30 setup**

All 66 active rules across all product families get the same treatment via a single transform.

---

## Architecture decision

**Option A (chosen): Multi-currency rules table.** Extend `pricing_rules` with `currency_code` and seed converted variants per region. The pricing engine filters by the active session currency.

Why not the alternatives:
- *Live FX conversion at render time* — fragile for a demo, unrealistic prices ($0.0297…), no buying-power adjustment.
- *Single rules table + multiplier lookup* — fights the "no hard-coding" memory rule and gives ugly numbers.

A new lightweight admin tool to regenerate the converted rules from ZA whenever ZA changes is included, so this stays admin-driven.

---

## Database changes

1. **Add columns to `pricing_rules`**:
   - `currency_code text NOT NULL DEFAULT 'ZAR'`
   - Backfill all existing rows to `'ZAR'`.
   - New unique index per `(product_family_id, name, currency_code, conditions_hash)` — or simpler: just allow duplicates and let the engine filter by currency.

2. **Add a small helper table `pricing_currency_profiles`** (admin-editable later):
   ```
   currency_code | fx_from_zar | buying_power_mult | rounding_step | min_value
   ZAR | 1.00      | 1.00 | 0.05  | 0.05
   GBP | 0.04474   | 1.15 | 0.01  | 0.01
   EUR | 0.05263   | 1.20 | 0.01  | 0.01
   USD | 0.05952   | 1.35 | 0.01  | 0.01
   AUD | 0.09091   | 1.20 | 0.01  | 0.01
   ```
   Used by the regenerate script and (later) the platform admin UI.

3. **Seed migration**: clone every active ZAR rule into 4 new rows (GBP/EUR/USD/AUD) with `price_value = round_to_step(zar_price × fx × multiplier, step)`. Negative volume-discount rows (e.g. `-0.05`) get the same transform; setup fees too.

4. **(Optional, recommended) DB function `regenerate_pricing_rules_for_currency(target text)`** — re-derives non-ZAR rules from current ZAR ones. Lets admins edit ZA prices and re-sync the others without manual SQL.

---

## Code changes

### `src/lib/calculatePrice.ts`
- Accept an optional `currencyCode` and filter `rules` to that currency before evaluating. Falls back to ZAR if no rules in target currency.

### `src/hooks/useRegionalPricing.ts`
- Already exposes `region.currency_code` and `region.currency_symbol`. No change needed beyond making sure both are read by consumers.

### New `src/lib/formatCurrency.ts`
- Single helper `formatPrice(amount, currencyCode, currencySymbol?)` using `Intl.NumberFormat` (style: 'currency'). Always 2dp. Replaces the scattered `R{x.toFixed(2)}`.

### Replace hard-coded `R{...}` in:
- `src/components/order/PriceSummary.tsx` (3 spots)
- `src/pages/dashboard/Cart.tsx` (3 spots)
- `src/pages/dashboard/Checkout.tsx` (4 spots)
- `src/pages/dashboard/OrderConfirmation.tsx` (1 spot)
- `src/pages/dashboard/OrderBuild.tsx` (any price spots)
- `src/pages/dashboard/PhotoPrintsBuilder.tsx`
- `src/components/order/OptionSelector.tsx` (option price impacts)

Each consumer pulls the active region from `useRegionalPricing()` and calls `formatPrice(amount, region.currency_code)`.

### Pricing-rule fetcher
- Wherever the client currently does `supabase.from('pricing_rules').select('*').eq('product_family_id', …)`, add `.eq('currency_code', region.currency_code)`. Identify these via `rg "from\\(['\"]pricing_rules"`.

### `useCart.ts` & order/checkout writes
- When persisting `unit_price`, `subtotal`, `total_amount` etc. on `orders` / `order_items`, also write `currency` (already present on `orders`). Cart total maths stays in the active currency end-to-end — no mid-flight conversion.
- An order placed in USD stays USD on the customer's order history.

---

## Admin / platform UX (light touch)

- **`/platform/pricing-regions`** already exists for SaaS plans — extend with a tab "Demo Print Pricing" that shows the `pricing_currency_profiles` table and a **"Regenerate from ZA"** button per non-ZA currency. Calls the SQL function, updates rounded prices.
- No new region-specific manual rule editor for the demo (ZA is the source of truth; others are derived). Keeps maintenance to one place.

---

## What this does NOT touch

- Geolocation logic (already working).
- The SaaS subscription plans on `/pricing` (already correctly priced per region).
- Tenant-level pricing for live customers — when real tenants go live they'll set their own ZAR/GBP/etc prices in their admin. This is purely the **demo storefront** experience.
- Cart edit / order snapshot logic — orders snapshot prices at submit time, so historical orders are unaffected.

---

## Rollout order (single approval = full implementation)

1. Migration: add `currency_code` to `pricing_rules`, create `pricing_currency_profiles`, backfill, seed 4 currency variants of every ZA rule.
2. Add `formatCurrency.ts` helper.
3. Update `calculatePrice.ts` to filter by currency.
4. Replace all hard-coded `R{...}` and `from('pricing_rules')` calls (~10 files).
5. Wire cart/checkout to persist + display in active currency.
6. Add "Demo Print Pricing" tab on platform pricing-regions page with regenerate button.
7. Manual QA: switch region via the existing region picker → verify configurator, cart, checkout, order confirmation all show the right symbol/values; verify ZA path unchanged.

---

## Open question (will assume defaults if not flagged)

- **VAT/tax**: today the cart hard-codes 15% VAT (ZA). Should non-ZA regions show VAT-exclusive (US-style) or VAT-inclusive at local rates (UK 20%, EU ~21%, AU 10% GST)? **Default assumption**: keep the current 15% VAT line but rename it to "Tax" outside ZA — proper per-region VAT can be a follow-up if you want it.