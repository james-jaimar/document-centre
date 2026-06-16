# Fix Document Size duplication on Bound Documents

## What I found (the three places)

1. **Customer configurator** — shows all 10+ master sizes (A6, DL, A5, A5 Landscape, A4, A4 Landscape, A3, SRA3, A2, A1, …).
2. **Admin → Products → Catalogue tab** — admin has 4 sizes enabled (A4, A5, US Letter, US Legal). This writes to `product_catalog_links` (catalog='size').
3. **Admin → Products → Options tab** — has a `product_options` row called "Document Size" with `source = catalog.sizes` and 15 frozen `values` left over from the pre-catalogue era.

### Why they disagree
`useCatalogBackedOptions` for `source = 'catalog.sizes'` does:
```
next = sizeValuesFromLinks ?? allSizeValues
```
When the resolved-links projection comes back empty/unmatched, it silently falls back to the **entire master catalogue** — that's the "every size shows" bug. Meanwhile the Options tab still renders a Document Size picker from its own stale `values` array (15 entries), so admins see a third, different list.

The Catalogue tab (`product_catalog_links`) is the only place actually driven by admin intent. The other two are legacy.

## Plan — make the Catalogue tab authoritative

### 1. Customer-side: respect the links, never fall back to the full master
In `src/hooks/useCatalogBackedOptions.ts` for the `catalog.sizes` branch:
- If `product_catalog_links` rows exist for `catalog='size'` on this family, use **only** those (already what `sizeValuesFromLinks` produces).
- If no links exist at all, keep the current full-master fallback (so a brand-new family still renders something).
- Drop the silent "links empty → show everything" path. Same treatment for `catalog.papers` Cover/Body so we don't trip the same bug there next.

### 2. Hide "Document Size" from the Options tab
Document Size is now configured exclusively under **Catalogue → Document Sizes**. In the Options admin UI (`src/components/admin/ProductOptionsTab*.tsx` or equivalent), filter out option rows where `source = 'catalog.sizes'` so admins don't see/edit a duplicate picker. The DB row stays (used by the customer hook), but it's no longer editable in two places.

Add a small banner in the Options tab: *"Document sizes are managed in the Catalogue tab."*

### 3. One-time data reconciliation
For every master `product_options` row with `source = 'catalog.sizes'`, blank out `values` to `[]`. The customer hook will then derive values purely from `product_catalog_links` (via the `resolve_product_options` RPC) + master `catalog_sizes`. No more stale 15-entry list lingering in the DB.

### 4. Sanity-check the resolve RPC
Spot-check `resolve_product_options(<bound-documents>, null)` returns exactly 4 size rows (A4, A5, US Letter, US Legal) with `is_enabled = true`. If it returns more, the bug is inside the RPC and we fix the SQL there too (the duplicate `scope_type='tenant'` rows in `product_catalog_links` look suspicious — 5 copies of the same 4 sizes — and may need a dedupe).

## Files to touch
- `src/hooks/useCatalogBackedOptions.ts` — remove silent full-master fallback for `catalog.sizes` (+ same for `catalog.papers`).
- Admin Options tab component — hide rows where `source ∈ {catalog.sizes}` and show the redirect banner.
- One `UPDATE` via supabase--insert: clear `values` on all `source='catalog.sizes'` product_options rows.
- Possibly a small migration to dedupe `product_catalog_links` (only if the spot-check shows duplicates causing the RPC to over-return).

## What stays the same
- Paper Stock, Cover, Binding, Lamination, etc. continue to live in Options (they have no equivalent toggle in the Catalogue tab).
- Branch overrides via `branch_catalog_overrides` keep working — they layer on top of the family's links exactly as today.

## Verification
- Bound Documents customer picker shows exactly A4, A5, US Letter, US Legal.
- Toggle US Legal off in the Catalogue tab → it disappears from the customer picker on next load.
- Options tab no longer shows a "Document Size" row.
