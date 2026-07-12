## Goal
For **Flyers only** (and any future family in `quantity_mode === "blocks"`), stop sourcing Document Size / Paper / Sides from `product_options`. Instead, derive those selectors from the resolved pack-pricing ladder (`quantity_blocks`) so what the customer sees always matches what's actually priced. Lamination / Print to Edge / other non-pack options continue to come from `product_options` as usual.

## Behaviour after change (customer view, Flyers)

Options panel renders in this order:

1. **Document Size** — dropdown, values = distinct `size` slugs from the resolved `quantity_blocks` (filtered by current Paper/Sides where relevant).
2. **Paper Stock** — dropdown, values = distinct `paper` slugs available for the selected size.
3. **Print Sides** — Single / Double, values = distinct `sides` available for the selected size + paper.
4. **Quantity** — dropdown of `qty` rows from blocks matching the (size, paper, sides) triple (already implemented in `PriceSummary`).
5. Any remaining admin-configured `product_options` **that are not** Document Size / Paper Stock / Paper / Print Sides — e.g. Lamination, Print to Edge, Shrink Wrap — rendered as today.

A wildcard (`*`) in a block field means "any", and is preserved: if all blocks have `paper = "*"`, the Paper selector is hidden (no meaningful choice); same for Size and Sides. This keeps small ladders simple.

Non-blocks families (everything except Flyers today) are unchanged — they keep the current `product_options`-driven panel.

## Where the change happens (frontend only)

1. **`src/components/order/OptionsPanel.tsx`**
   - Accept new optional props:
     - `packBlocks?: QuantityBlock[]` — the resolved ladder (branch → tenant → master) that `OrderBuild` already computes.
     - `blocksActive?: boolean`.
   - When `blocksActive`:
     - Suppress `product_options` whose name matches Document Size / Paper Stock / Paper / Print Sides (case-insensitive, matched via a small `PACK_MANAGED_OPTION_NAMES` set).
     - Prepend synthetic rows for Document Size, Paper Stock, Print Sides built from the block ladder. Values use the same label helpers already used (`humaniseSlug`, size/paper label maps) so users see `A4`, `130gsm Matt`, `Double-sided` — never raw slugs.
     - Filter downstream selectors by earlier selections (size → paper list → sides list), and auto-repair invalid combos by snapping to the first available value (same pattern `PriceSummary` already uses to pick `activeBlock`).
   - Emit changes through the existing `onOptionChange(name, slug)` so the rest of the pipeline (spec, pricing, preview) needs no changes.

2. **`src/pages/dashboard/OrderBuild.tsx`**
   - Pass `packBlocks={quantityBlocks}` and `blocksActive={blocksActive}` (both already in scope) into `<OptionsPanel />`.
   - On first render for a blocks family, seed `selected_options["Document Size"] / ["Paper"] / ["Print Sides"]` from the first block if unset, so the price and preview aren't empty. Existing seeding for `Print Colour` / `Print Sides` stays intact.
   - Keep the existing size-auto-detection logic, but constrain its candidate set to sizes present in `quantityBlocks` when `blocksActive`.

3. **`src/components/order/PriceSummary.tsx`** — no functional change; it already renders the pack quantity dropdown when `blocksActive`. Just verify labels stay consistent with the new Size/Paper/Sides options.

## Admin-side implications (no code change now)

- Admins can still attach Lamination, Print to Edge, etc. to Flyers via Product Options — those will render as extras. If an admin attaches a Paper Stock / Document Size / Print Sides option to a blocks family, it will be silently hidden in the customer UI (the pack ladder wins). We can surface an admin warning in a later pass if needed — out of scope here.

## Out of scope

- No DB migrations.
- No changes to pricing math, `resolvePackPricing`, or the pack editors.
- No changes to non-flyer families.
- No changes to cart / order snapshot shape — the spec still carries `selected_options["Document Size"]`, `["Paper"]`, `["Print Sides"]` exactly as today.

## Files touched

- `src/components/order/OptionsPanel.tsx` — add pack-aware rendering.
- `src/pages/dashboard/OrderBuild.tsx` — pass pack props, seed defaults from blocks.
