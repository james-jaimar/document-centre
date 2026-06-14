# Master Pricing → Finishing: make rows editable inline

Right now the Finishing tab shows **Item / Category / Basis / Size** as plain text — you can only edit Sell, Cost and Active. The note tells you to go to *Master Catalogue → Finishing* to change anything else, which is exactly the bounce-around you want to stop.

This change adds inline editing for those four columns on the master scope only, same pattern we just used for Papers (Cover/SRA3 toggles + Add).

## Changes

### 1. `CatalogFinishingPricing` in `src/components/pricing/MasterCatalogPricingEditor.tsx`

Replace the read-only cells with inline controls (master scope only — tenant/branch stay read-only because their rows cascade from master):

- **Item** → `Select` of all `catalog_finishing` items. Changing it updates `catalog_finishing_prices.finishing_id` for that price row.
- **Category** → `Select` with the values already in use: `binding, cover, folding, guillotining, hole_punching, inserts, lamination, packaging, special, stapling, tab_dividers, trimming`. Free-text "Other…" option that opens a tiny prompt for a new value (so we're not boxed in if you add a new category later). Writes `catalog_finishing.category`.
- **Basis** → `Select` of `per_unit | per_sheet | per_set`. Writes `catalog_finishing.pricing_basis`.
- **Size** → `Select` of `Any` + every code from `catalog_sizes` (already loaded by the editor). Writes `catalog_finishing_prices.size_code` (`null` for "Any", matching today's behaviour).

Cells stay compact (`h-8`, small text) so the table density doesn't change.

On tenant/branch scope the cells render as today (plain text badges) — `canEdit = scopeArgs.scope === "master"`.

### 2. Hook: `usePatchCatalogFinishing` in `src/hooks/useCatalog.ts`

Mirror of the `usePatchCatalogPaper` hook we just added. Partial update by `id` of `category` / `pricing_basis` / `label`. Invalidates `catalog_finishing` and `catalog_finishing_prices` (because the joined view in the editor reads both).

### 3. Reuse existing mutations

- Changing **Size** or **Item** uses the existing `useUpsertCatalogFinishingPrice` (passes the price row's `id` plus the new `size_code` / `finishing_id`).
- No schema change, no migration, no new RLS.

## Out of scope

- The "Add finishing price" dialog stays as-is — it already lets you pick item / category-via-item / size.
- No changes to Papers, RateCard, or the Master Catalogue → Finishing editor.
- We're not adding a "delete category" or "rename category globally" workflow — editing category on one row only changes that row's `catalog_finishing` record (which is how it works in the catalogue editor today).

## Technical notes

- `catalog_finishing.category` and `pricing_basis` are plain `text` columns (no enum), so writing arbitrary strings is safe — but the dropdown keeps things tidy.
- Optimistic update + `toast` on failure, same pattern as the Cover toggle.
