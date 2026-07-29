## Canvas Prints pricing

Add a new **Canvas Prints** tab to the rate-card editor (next to Click Charges / Photo Prints / Business Cards), backed by its own rate-card table so master → tenant → branch cascade + "Pull missing from master" behaves like the other tabs.

### Data model
New table `rate_card_canvas_prints` (mirrors `rate_card_photo_prints` shape):
- `size_code` — one of the canvas presets (`a4`, `a3`, `a2`, `a1`, `a0`, `sq-300`…`sq-1000`)
- `wrap_mm` — 25 / 38 / 50
- `wrap_mode` — `no_edge_print` | `gallery_wrap` | `mirror_wrap` | `blur_wrap` | `colour_wrap` | `face_only`
- `sell_price_minor`, `cost_price_minor`, `is_active`
- `scope_type` (master/tenant/branch), `tenant_id`, `branch_id`, `currency_code`
- unique index on `(scope_type, coalesce(tenant_id), coalesce(branch_id), size_code, wrap_mm, wrap_mode, currency_code)`
- GRANTs + RLS matching the other rate-card tables
- Extend `clone_tenant_catalog_to_branch` + master→tenant pull to include the new table so brand-new branches get seeded automatically

### Editor UI (`RateCardEditor.tsx`)
New tab **Canvas Prints** with a matrix:
- Rows = size presets (uppercase labels — A4, A3…, 300×300 mm)
- Grouped columns per wrap depth (25 / 38 / 50 mm), each column split by wrap mode
- Simpler default: one row per size, with a nested table Size × Wrap depth, and a "Wrap-mode surcharge" section (e.g. Gallery/Mirror/Blur/Colour = +R x, No-edge/Face-only = base). Final price = base(size, depth) + surcharge(wrap_mode). This keeps the grid small.
- Standard `TiersButton` for quantity price breaks
- "Pull missing from master" button (same pattern as other tabs)

### Pricing engine
- New resolver hook `useResolvedRateCardCanvasPrints` following the photo-prints pattern
- Extend `rateCard` bundle in `useItemPricing.ts` with `canvasPrints`
- Add `calculateCanvasPrintsPrice` in `calculatePrice.ts` that iterates `spec.canvas_prints.canvases[]`, looks up `(size_code, wrap_mm, wrap_mode)` and multiplies by `quantity`
- Wire into `PriceSummary` for `canvas_wrap` product kind

### Out of scope (this task)
- No changes to the canvas builder UX itself
- No per-variant / per-bleed pricing; bleed and DPI don't affect price
- Colour-wrap uses same surcharge as gallery/mirror unless the matrix says otherwise

### Deliverables
1. Migration: `rate_card_canvas_prints` + GRANTs + RLS + seeding hooks
2. `useResolvedRateCardCanvasPrints` hook + query invalidations
3. New `CanvasPrintsTab` inside `RateCardEditor.tsx` (master + tenant + branch scopes)
4. Pricing calc + wiring in `useItemPricing` and `PriceSummary`
