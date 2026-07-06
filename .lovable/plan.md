## Goal
Sell flyers in fixed quantity blocks (50, 100, 250, 500, 1000, 2500, 5000…) instead of a free-form numeric quantity, with each block having its own price — which is the standard print-shop model.

## Approach
Reuse the existing `rate_card_price_breaks` infrastructure (already powering business cards & photo prints) rather than inventing a new pricing system. Flyers just become another family whose price comes from a tiered rate card, and the UI swaps the +/- spinner for a block selector.

## 1. Data model
- No new tables. Use existing `rate_card_price_breaks` keyed by `product_family_id` (flyers), `size` (A6/A5/A4/DL), `paper`, `sides`, and `min_quantity`/`max_quantity`.
- Add a small `product_families.quantity_mode` column: `'free' | 'blocks'`. Default `'free'` (backwards compatible). Set flyers to `'blocks'`.
- Optionally add `product_families.quantity_blocks jsonb` (e.g. `[50,100,250,500,1000,2500,5000]`) so the admin can curate the offered blocks per family without deriving them from rate-card rows. Falls back to `distinct min_quantity` from the rate card if null.
- Branches can already override rate cards via `branch_catalog_overrides` / price overrides — no extra work.

## 2. Admin (tenant + branch)
- Product Families editor: new "Quantity mode" toggle (Free number / Fixed blocks) and a "Blocks" chip editor when `blocks` is selected.
- Rate Card editor for Flyers: already supports tiers by size/paper/sides — just seed the standard SA flyer matrix (A6/A5/A4/DL × 130gsm gloss / 170gsm silk / 250gsm × single/double sided × the block tiers) so it ships usable out of the box.
- Branch override screen re-uses the existing rate-card override UI.

## 3. Customer order flow
- `PriceSummary.tsx`: when `family.quantity_mode === 'blocks'`, replace the numeric spinner with a segmented control / dropdown listing the allowed blocks. Show the per-block price and unit price (e.g. `500 flyers — R850  (R1.70 each)`).
- `useOrderBuilder`: initialise `quantity` to the first block; validate that any incoming quantity snaps to an allowed block.
- `calculatePrice.ts`: for block-mode families, look the price up directly from `rate_card_price_breaks` (exact `min_quantity` match) instead of `unit_price × qty`. Photo prints / business cards already do this — extract the shared helper if useful.
- Cart / order item snapshot: store the chosen block quantity + resolved tier id in `configuration` so the historical price is preserved (already the pattern via `order_pricing_snapshots`).

## 4. Seed data
Migration seeds the default flyer rate card matrix so the feature works immediately for existing tenants; tenants/branches can then override.

## 5. Out of scope
- No changes to non-flyer families (they stay on `free` mode until a tenant opts in).
- No custom-quantity fallback for flyers (owner-configurable later if requested).
- No changes to delivery/weight logic — weight is already `per-sheet × quantity`.

## Technical notes
- Files touched: `supabase/migrations/*` (add columns + seed), `src/hooks/useProductFamilies.ts`, product-family admin editor, `src/components/order/PriceSummary.tsx`, `src/hooks/useOrderBuilder.ts`, `src/lib/calculatePrice.ts`, and a small `resolveBlockPrice()` helper alongside `useRateCardPriceBreaks`.
- Types regenerate after the migration; no manual edits to `types.ts`.
