# Quantity Price Breaks on Rate Card Line Items

Today every rate card line (click charge, paper, finishing, business card, photo print) has a single `sell_price` / `cost_price`. We will let each line carry a **sliding scale of prices by total quantity**, edited per-line via a modal on the rate card, and used automatically by the pricing engine.

## Default tiers (pre-populated for every line)
- 1 – 99
- 100 – 249
- 250 – 499
- 500+

The line's existing `sell_price` / `cost_price` seeds the first tier (1–99); upper tiers start equal to it and the user edits them.

## Where it lives in the hierarchy
Same three-layer model already used by the rate card:
- **Master** (platform) line → has its own breaks
- **Tenant** clone → inherits master breaks on clone, then independently editable
- **Branch** clone → inherits tenant breaks on clone, then independently editable

No new scope concepts — breaks ride along with the line they belong to.

## UX on the Rate Card editor
On every tab (Click Charges, Paper Stocks, Finishing, Photo Prints, Business Cards):

1. The row stays as-is, but the **Sell (R)** cell becomes clickable (cell still shows the 1–99 price as the "from" price, with a small "4 tiers" hint).
2. Clicking the row (or a dedicated "Price breaks" icon button on the row) opens a **Price Breaks modal** scoped to that line:
   - Title: line description (e.g. "A3 · Colour · Duplex")
   - Editable table: `Min qty | Max qty | Sell (R) | Cost (R)` with add / remove row and a "Reset to defaults" button.
   - Validation: tiers must be contiguous, non-overlapping, ascending; the last tier's max is open-ended (blank = ∞); min of first tier is 1.
   - Save writes all breaks atomically for that line.
3. The Sell column on the main table shows the lowest tier price; tooltip lists the full ladder.

No change to Master / Tenant / Branch routing — same modal in all three editors, gated by the same edit permissions already in place.

## Pricing engine behaviour
When pricing an item, for each rate-card line used we resolve the price by **the total quantity for that line in the current item**:

- **Click charges** → total clicks for that size/colour/sides on the item (sheets × sections × order qty for that click line).
- **Paper** → total sheets of that paper used by the item.
- **Finishing** → total units of that finishing op (typically order qty, e.g. binders, lamination sheets).
- **Business cards / Photo prints** → total pieces ordered of that SKU.

The engine picks the single tier whose `[min, max]` contains the resolved quantity and uses that tier's `sell_price` / `cost_price`. If no break rows exist for a line (legacy), it falls back to the line's own `sell_price` / `cost_price` (current behaviour) — zero-risk migration.

Price breakdown popover already shown to customers gets a small "@ qty 350 → tier 250–499" hint per affected line.

## Technical section

### New table
`public.rate_card_price_breaks`
- `id uuid pk`
- `rate_card_table text not null` — one of `clicks | papers | finishing | business_cards | photo_prints`
- `rate_card_id uuid not null` — FK enforced by trigger (polymorphic; each row also denormalises `scope_type`, `tenant_id`, `branch_id` for RLS)
- `scope_type`, `tenant_id`, `branch_id` — copied from parent line, kept in sync by trigger
- `min_quantity int not null check (min_quantity >= 1)`
- `max_quantity int null` — null = open-ended
- `sell_price numeric(12,2) not null`
- `cost_price numeric(12,2) not null default 0`
- `sort_order int not null default 0`
- `created_at`, `updated_at`
- Unique `(rate_card_table, rate_card_id, min_quantity)`
- Index on `(rate_card_table, rate_card_id, sort_order)`

RLS mirrors the parent table's policies via the denormalised `scope_type/tenant_id/branch_id` (re-using existing `has_role` / membership helpers — no new security primitives).
GRANTs: `authenticated` + `service_role` (no `anon`).

### Triggers / cloning
- After-insert trigger on each `rate_card_*` table seeds the 4 default break rows (only if none exist yet) using the parent's `sell_price` / `cost_price`.
- Existing "clone master → tenant" and "clone tenant → branch" routines extended to copy the price-break rows alongside the line.
- Backfill migration: for every existing rate-card line with no break rows, insert the 4 default tiers using its current price.

### Pricing engine
- Extend `RateCardBundle` (in `src/hooks/useRateCard.ts`) to load break rows grouped by `(table, id)` in a single query per tab.
- New helper `resolveTieredPrice(line, breaks, qty)` in `src/lib/calculatePrice.ts`; called from each line-pricing path (`calculatePriceFromRateCard`, photo-print resolver, business-card resolver). Fallback returns the line's `sell_price` when no breaks exist.
- Pass per-line quantity into the resolver (already known inside the existing breakdown loop for clicks/paper/finishing; for photo prints and business cards it's `spec.quantity`).

### Frontend
- New `PriceBreaksModal` component (single component, parameterised by `rateCardTable` + parent line).
- New `useRateCardPriceBreaks(table, lineId)` hook for read + bulk upsert.
- `RateCardEditor.tsx` rows get an onClick / small `Layers` icon button opening the modal; column header tooltip explains the tiered model.

### Out of scope (this change)
- Per-tenant overrides of the *default tier boundaries* (we ship with the four fixed defaults; tiers themselves are still freely editable per line).
- Customer-group / contract-specific price breaks (still handled by existing `product_price_overrides`).
- Backwards changes to legacy `pricing_rules` table.
