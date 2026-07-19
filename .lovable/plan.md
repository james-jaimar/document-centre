## What I actually found in the database

Confirmed reads (not guesses):

- `catalog_sizes` has **only one** pull-up size left: `pub-850x2000` "Pull up banner". The `+100mm` / `+200mm` sizes are gone as you said.
- `product_catalog_links` for the Pull Up Banners family still has **three** rows: `pub-850x2000`, `pub-850x2100`, `pub-850x2200`. The last two are orphans — the sizes they point to no longer exist.
- `rate_card_clicks` (master scope) only has 2 variant rows, both for `pub-850x2000` (economy + executive). No stale click rows.
- `catalog_variants` / `product_variant_links` are clean (Economy + Executive only).

So the DB is mostly clean — but the Products → Catalogue tab for Pull Up Banners is still holding onto pointers to deleted sizes, and nothing today removes them when a `catalog_sizes` row is deleted.

## Why the branch page looks "hard-coded"

The Variant Pricing block iterates `product_catalog_links` joined to `catalog_sizes`. With orphan links present, the join drops them — so the branch page should really only be showing **one** card ("Pull up banner"), not three. The three cards in your screenshot look like a stale React Query cache from before the size deletes. I want to verify that with a hard refresh before assuming code is wrong.

"Pull missing from tenant" and "Re-sync from tenant" only touch `rate_card_*` — neither one removes orphan `product_catalog_links` or refreshes what the Variant Pricing matrix considers a valid size. That's the real gap.

## Plan

1. **Verify current render** — ask you to hard-refresh the branch Pricing page once. If only the single "PULL UP BANNER" card remains, the DB fix in step 2 is still worth doing to prevent it recurring; if all three cards persist after refresh, there's a real code bug to chase and I'll dig further before touching more code.

2. **Delete orphan product_catalog_links** — one-off cleanup for Pull Up Banners so the Products → Catalogue tab and any downstream consumer stops referencing `pub-850x2100` / `pub-850x2200`.

3. **Prevent recurrence at the DB level** — either:
   - add `ON DELETE CASCADE` from `product_catalog_links.item_code` (via a trigger, since it's a text code not a real FK), OR
   - a lightweight `AFTER DELETE` trigger on `catalog_sizes` that removes matching `product_catalog_links` rows for `catalog = 'size'`.

   I'll use the trigger approach — same pattern for `catalog_papers`, `catalog_finishing`, `catalog_print_attrs` so any future master-catalogue deletion cleans up product links automatically.

4. **Defensive filter in `VariantPricingMatrix.tsx`** — even with clean data, drop any `familySizeCodes` entry that doesn't resolve to a live `catalog_sizes` row (it already does this via `.filter`, but I'll also skip rendering the family entirely when no linked sizes remain, and log a dev-only warning so orphans are visible).

5. **No changes to variant links or rate-card rows** — those are already clean.

### Files touched

- New migration: trigger `trg_catalog_size_delete_cleanup_links` + backfill DELETE for existing orphans.
- `src/components/admin/VariantPricingMatrix.tsx`: defensive empty-state.

### Not doing

- No refactor of "Pull missing from tenant" / "Re-sync" — those semantics are correct; the bug was that the master catalogue itself had drift.
- No change to variant pricing UI layout.
