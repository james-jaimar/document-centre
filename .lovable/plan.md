# Goal

Walk every active product family end-to-end and confirm that what the customer sees in the configurator (options, defaults, prices) is actually driven by the **master catalogue** (papers / finishing / sizes) and the **master rate card** (click charges, paper sell prices, finishing sell prices, binding spine table). Fix every break we find.

Trigger: Presentations is showing R19,00 with no document uploaded, and the user has spotted that picking a binding doesn't move the price the way it should. Past sessions have already shown similar wiring slips on Bound Documents and Booklets, so this pass is a sweep, not a single-product fix.

# What the audit will check, per family

For every active family (Booklets, Bound Documents, Brochures, Business Cards, Flyers, Photo Prints, Posters, Presentations, Ring Binders, Stapled & Loose Pages) I will verify:

1. **Options are catalogue-backed where they should be.** `source` = `catalog.papers` / `catalog.finishing` / `catalog.sizes` / `catalog.print_attrs`. Anything still on `manual` that has a catalogue equivalent gets flagged.
2. **No duplicate option rows.** First sweep already shows:
   - Ring Binders has **two `Binding` rows** (8 values + 3 values).
   - Brochures has **`Fold Type` (4) and `Folding` (3)** doing the same job.
   - Brochures has both a `Trimming` and a `Finishing`-style row to reconcile.
3. **Customer-visible value list is clean.** No `internal: true` rows leaking through, no orphan codes that no longer exist in the master catalogue, no stale snapshots from before the binding simplification (Bound Documents / Presentations `Covers` = 18 entries and `Paper Stock` = 25 entries — almost certainly carrying legacy rows).
4. **Defaults exist and are sane.** Every required option has exactly one `is_default` row, and that default code resolves in the master catalogue.
5. **Recipe derivation is complete.** `deriveRecipeFromOptions` currently only carries papers + finishing into the recipe. Confirm that:
   - Every catalogue-backed paper code in `product_options.values` matches a `catalog_papers.code` and has a `catalog_paper_prices` row.
   - Every catalogue-backed finishing code (including binding family codes like `comb-black`, `wire-silver`, `spiral-clear`) matches a `catalog_finishing.code` and has a `catalog_finishing_prices` row.
   - For families on `auto_size_from_sheets` binding (Bound Documents, Booklets, Presentations) the spine table the engine reads from is populated for every visible binding family.
6. **Rate-card engine is actually firing.** `useNewEngine` flag requires `rcClicks` / `rcPhotoPrints` / `rcBusinessCards` to be non-empty at the active scope (tenant or branch). For each family I will confirm the active branch/tenant has the click charges seeded, otherwise it silently falls back to legacy `pricing_rules` and finishing uplifts get ignored.
7. **Selected option actually moves the total.** For each family, pick a non-default value (e.g. a different binding, lamination, paper) and confirm `calculatePriceFromRateCard` produces a different total than the default. The Presentations R19,00 case is the canary — fix anything that fails this test.

# Deliverables

1. A short written report in chat listing, family-by-family, every wiring gap found (duplicate options, stale snapshots, missing catalogue codes, missing prices, dead defaults, engine-fallback cases).
2. One migration that fixes the data-side issues:
   - Removes the duplicate `Binding` row on Ring Binders and the duplicate `Folding`/`Fold Type` rows on Brochures.
   - Re-snapshots `Covers` and `Paper Stock` on Bound Documents and Presentations from the master catalogue (drops legacy/`internal:true` rows from the customer list).
   - Adds any missing `catalog_*_prices` rows that the report identifies.
   - Sets a default value on any option that currently has none.
3. Code fixes only where derivation logic is wrong (e.g. if `deriveRecipeFromOptions` needs to carry an extra option type, or if `useNewEngine` needs to include a family that has no click charges but still needs the rate-card path). No UI redesign.

# Technical notes

- Source of truth in code: `src/lib/productRecipe.ts`, `src/lib/calculatePrice.ts`, `src/lib/catalog/optionAdapter.ts`, `src/pages/dashboard/OrderBuild.tsx` (lines 155-200 for engine selection).
- Source of truth in DB: `product_options`, `catalog_papers` + `catalog_paper_prices`, `catalog_finishing` + `catalog_finishing_prices`, `catalog_sizes`, plus the binding spine table the size-family auto-resolver reads.
- No changes to ring-binder rings, saddle-stitch geometry, or the Photo Prints / Business Cards rate-card structure unless the audit specifically flags them.
- No customer-portal UI redesign — this is purely a wiring / data-integrity pass.

# Out of scope

- Adding new products or new option types.
- Changing the simplified binding model (we keep the 6-row customer list from the previous session).
- Tenant-level overrides — we only fix the master layer; tenants inherit from it.
