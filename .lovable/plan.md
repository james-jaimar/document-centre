# Bound document pricing — diagnosis & fix

## What the R48.80 actually is

For your 8-page A4 duplex colour, PostNet rate card:

- Click: A4 colour duplex = **R12.00** per duplex sheet × **4 sheets** = R48.00
- Paper: 80gsm Bond A4 = **R0.20** × **4 sheets** = R0.80
- **Total = R48.80** ✓

That part of the math is correct (and matches the rule we locked in: duplex click = one charge per sheet/two faces, plus one paper sheet).

## What's missing

**Binding is not being charged at all.** Expected R18 for 8mm wire → total should be R66.80.

Root cause: the new rate-card pricing engine (`calculatePriceFromRateCard` in `src/lib/calculatePrice.ts`) only sums:
1. Clicks (per section)
2. Paper
3. `rate_card_finishing` rows that are either `required` in the product recipe **or** listed in `spec.selected_options.finishing` (a comma-separated string).

The Binding selector on bound documents is a `product_options` row whose values carry `price_impact: 22` and `metadata.binding_method: "twin_loop"`. The engine never:
- reads `product_options[*].values[*].price_impact`, and
- maps the chosen `binding_method` (+ required spine size for the sheet count) onto a `rate_card_finishing` code like `wire-8mm`.

So the binding charge silently disappears whenever a product uses the rate-card engine (which is everything now). Same hole exists for Cover, Cover Lamination, Paper Stock upgrades, etc. — any `product_options` price_impact is ignored.

## Fix plan

### 1. Make `calculatePriceFromRateCard` honour `product_options` price impacts

Pass `options: ProductOption[]` into the rate-card calculator (PriceSummary already has it) and, after the clicks/paper/finishing block, iterate the selected option values exactly like the legacy `calculateItemPrice` does — `per_page`, `per_document`, `fixed` multipliers — and emit a line per non-zero `price_impact`.

This single change recovers binding, cover, lamination, and paper-stock surcharges across every product.

### 2. Prefer the real rate-card finishing row when the option carries a `binding_method`

For binding values, the per-document `price_impact` (e.g. R22 flat) is a fallback. The accurate charge lives in `rate_card_finishing` keyed by spine size:

- pick the required spine from sheet count using `binding_specifications` (already used elsewhere) → `wire-8mm`, `comb-10mm`, etc.
- if that finishing row exists and is active, bill **it** (`per_unit` × qty) and skip the option's `price_impact`.
- otherwise fall back to `price_impact` so nothing ever drops to zero.

That gives PostNet: 8 sheets of 80gsm → wire 8mm → **R18.00** instead of the option's flat R22.

### 3. Same treatment for Cover / Lamination / Paper Stock

These options already have matching `rate_card_*` codes (`card-cover-250-a4`, `lamination-*`, paper codes). Where the option value's `metadata` references a rate-card code, use the live rate-card price; otherwise fall back to `price_impact`. Keeps tenants in control via the master rate card without re-editing every product.

### 4. Verify with the same configuration

After the change, reload `/t/postnet` bound documents → 8-page A4 colour duplex + Twin Loop Wire 8mm + No Cover + 80gsm Bond:

- Click R48.00 + Paper R0.80 + Wire 8mm R18.00 = **R66.80** ✓

Breakdown popover should list all three lines.

## Files touched (frontend only — no DB changes)

- `src/lib/calculatePrice.ts` — extend `calculatePriceFromRateCard` to consume `options` and resolve binding/cover/lamination against the rate card with fallback to `price_impact`.
- `src/components/order/PriceSummary.tsx` — pass `options` into the rate-card branch.
- `src/pages/dashboard/OrderBuild.tsx` — already has `options`; just thread through.

No migrations. No changes to recipes, master pricing, or stored cart snapshots.
