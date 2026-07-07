
## Problem

In the Edit Product Family dialog, the Fixed Pack Sizes matrix uses free-text inputs for Size, Paper and Sides. Admins can type anything, so the values never reliably match the catalogue codes the customer flow uses to look up a matching block. Result: pricing silently falls through to "no block matches".

## Goal

Every Size / Paper / Sides value in a pack row must be chosen from the same catalogue and family config the customer flow reads, so the keys are guaranteed to line up.

## Changes (frontend only)

`src/components/admin/ProductFamilyForm.tsx` — `QuantityBlocksSection`:

1. Replace the three text inputs with `Select` dropdowns.
2. Data sources:
   - **Size** — `useCatalogSizes()` filtered to the family's `printing_rules.allowed_finished_sizes` (fall back to all active catalog sizes if none configured). Option value = catalog size `code`, label = catalog `label` (e.g. `A5`, `DL`).
   - **Paper** — `useCatalogPapers()` (master scope, active). Option value = paper `code`, label = `label` + weight. Later we can narrow to papers linked to this family, but for now the full active paper list matches how the customer picker resolves.
   - **Sides** — read allowed values from the family's `product_options` "Print Sides" group if present; otherwise the fixed pair `Single` / `Double`.
3. Each dropdown includes a top `Any (*)` entry that stores `"*"` — preserves today's wildcard behaviour.
4. Show the human label in the row, store the lowercase catalogue code in state (same shape `QuantityBlock` uses today, no schema change).
5. "Duplicate singles → double" button stays; only enabled when the family allows a `double` sides option.
6. If the family has no allowed sizes / no papers loaded yet, show a short inline hint ("Configure allowed sizes first") instead of empty dropdowns.

Nothing else changes: `QuantityBlock` type, storage, migration, `blockMatchesField`, `PriceSummary` and `OrderBuild` all stay as-is because the stored codes are already what the customer flow matches against — we're just constraining admin input to legal values.

## Out of scope

- No DB migration, no backend changes.
- No change to the customer-side matching logic.
- No bulk "backfill legacy rows" UI — existing `*` wildcards keep working; admins can edit rows to pick concrete codes as needed.

## Verification

- Open Platform → Products → edit Flyers family → Fixed pack sizes: Size/Paper/Sides are dropdowns pre-populated from catalog; `Any (*)` is selectable.
- Pick a concrete Size + Paper + Sides row, save, then price a flyer with that exact combo on the customer side — block matches and price shows.
- Pick a combo not covered by any row — customer picker shows the existing "combination isn't offered" warning.
