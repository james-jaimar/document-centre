# Weights across the system, feeding courier pricing

Goal: every priced item can produce a reliable weight, so the existing zone/weight-band courier engine quotes real numbers instead of guesses.

## Where we are today (verified)

- Courier engine already works on weight bands: `delivery_zones` + `delivery_zone_locations` + `delivery_methods` + `delivery_rates` (`min_weight_kg`, `max_weight_kg`, `price`, currency, scope platform/tenant/branch), quoted by the `quote_delivery_rate` function and driven from `src/lib/delivery/quoteShipping.ts`. Admin editing lives in `src/components/delivery/DeliveryEditor.tsx`. **This model stays as-is.**
- Weights feeding it are guesswork. `quoteShipping.ts` re-implements a rough estimate: 5g per business card, 250gsm assumed for photo prints, `spec.paper_gsm ?? 80` for everything else, fixed 8g packaging, hard-coded 5% overhead in `weightCalculation.ts`.
- The good building blocks exist but are disconnected: `catalog_papers.weight_gsm` / `weight_lb` (real paper weights), `binding_specifications.weight_grams` (comb/wire/spiral data), `weightCalculation.ts::calculateWeight` (has binding + cover + packaging logic but nothing calls it).
- Pack ladders (`product_families.quantity_blocks`, plus tenant/branch rows in `product_pack_pricing_overrides`) carry size/paper/sides/qty/price/trade price/option — **no weight field**.
- Storage columns already exist and are unused: `order_items.weight_grams`, `order_jobs.weight_kg`.

## What we build

### 1. Weight on every pack price row (PrintJob-style)

Add `weight_grams` to the `QuantityBlock` shape — one weight per size/paper/sides/qty/option row, so 100 deskpads carries its own real weight. The pack pricing matrix (master, tenant override, branch override) gets a weight column next to the price columns, with:
- copy-down / fill-column helpers so a ladder can be keyed quickly,
- an "auto-estimate" button that pre-fills from paper gsm × trim size × qty as a starting point,
- a warning chip on any priced row that still has no weight.

### 2. Auto-calculated weight for made-to-order work

A single resolver, `src/lib/weight/resolveItemWeight.ts`, becomes the one place weight is decided, in this precedence:
1. Manual override on the order/job (see 4),
2. Pack row `weight_grams` × quantity,
3. Calculated: sum over document sections of `sheets × sheetWeight(trim, real gsm)` + binding element + covers + finishing, × copies,
4. Legacy estimate (current behaviour) as last resort, flagged as "estimated".

The calculation is rewired onto real data rather than hard-coded maps:
- paper gsm from `catalog_papers.weight_gsm` (via the option's metadata already carried on sections as `paper_weight_gsm`),
- binding weight from `binding_specifications.weight_grams`, matched on method + size + sheet count,
- cover and finishing weights from new `weight_grams` fields on the catalog finishing/cover entries (editable in Master Catalogue, inherited by tenant/branch copies),
- laminate adds a gsm-per-side uplift where configured.

The resolver returns a breakdown (paper / covers / binding / finishing / packaging) so it can be shown, not just a number.

### 3. Configurable packaging, per branch

Replace the hard-coded 5% / 8g with settings resolved branch → tenant → platform default:
- packaging grams per parcel,
- packaging % uplift,
- minimum billable kg (currently hard-coded 1.0kg),
- volumetric divisor (currently 5000).

Edited on the branch settings/delivery screen, with the tenant value shown as the inherited default.

### 4. Weight visible and correctable in the flow

- Cart and checkout show billable weight with a breakdown tooltip and whether it's calculated or estimated.
- Weight is persisted at add-to-cart / job-snapshot time into the existing `order_items.weight_grams` and `order_jobs.weight_kg` columns, so an order's shipping basis is frozen with its price.
- Admin order detail gets an editable weight (with an "overridden" badge) that re-quotes delivery — for the odd job the formula can't know about.
- Admin delivery editor shows a "test a weight" box: enter kg + address, see which zone/band/price would apply.

## Technical notes

- Migrations: `weight_grams` on catalog finishing/cover tables; packaging/volumetric keys added to the settings JSON (no schema change needed, `resolve_branch_setting` already cascades); relax the `quantity_blocks` validation triggers on `product_families` and `product_pack_pricing_overrides` to accept the optional `weight_grams` key; a `weight_grams_override` + `weight_source` column on `order_jobs`.
- `quoteShipping.ts` stops estimating inline and calls the new resolver; `weightCalculation.ts` is refactored into the resolver rather than left as dead code.
- Branch pricing import/export workbook (`branch-pricing-workbook` function) gains the weight column so ladders can be maintained in Excel.
- No change to `quote_delivery_rate`, the band model, or the zone resolution logic.

## Out of scope for this pass

Per-kg overflow pricing, multi-parcel splitting for very large orders, and live courier API rates. The band model stays manual.
