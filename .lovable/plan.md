## What's actually wrong

Three related bugs feeding off the same root cause.

**1. Duplicate `product_catalog_links` rows (root cause).**
For the Posters family, every linked item is duplicated **7×** (sizes, papers, colour_mode) or **3×** (sides, orientation). Confirmed via SQL: 21 size rows for just `a0`/`a1`/`a2`, 7 paper-stock rows per paper code, etc. Almost certainly caused by a seeding/migration script that ran multiple times without a uniqueness guard on `(product_family_id, scope_type, scope_id, catalog, sub_attribute, item_code)`.

**2. Tenant + Branch "Specs" dialogs render one row per link (no dedup).**
Both `TenantProductSpecsDialog` and `BranchProductSpecsDialog` iterate `product_catalog_links` directly, so the 7× duplication shows as 7 "A2 420×594mm" rows in the screenshots. Even after we clean the data, the UI should dedup defensively so a future stray duplicate doesn't break the screen.

**3. Customer Document Size dropdown ignores the links entirely.**
On the Posters storefront, the picker shows the full ISO master list (DL, A6, A5, A5 Landscape, A4, A4 Landscape, A3, SRA3, A2, A1) instead of just the linked `a0`/`a1`/`a2`. The Posters `product_options` row for "Document Size" has `source = catalog.sizes` but `values = []`, so `useCatalogBackedOptions` should fall through to `sizeValuesFromLinks` (the link-derived list). It's falling further through to `allSizeValues` (full master) — i.e. the link-derived projection is coming back empty for the customer context. Needs a short trace in build mode (likely the resolver returning 0 size rows for anon/branch context, or `resolvedRowsToSizeValues` failing the join).

## Plan

### Step 1 — Clean the duplicates and lock the table

Single migration:

- Delete duplicate `product_catalog_links` rows, keeping the lowest `id` per `(product_family_id, scope_type, COALESCE(scope_id,...), catalog, COALESCE(sub_attribute,''), item_code)`.
- Add a unique index on that same key so re-seeding can never re-introduce duplicates.

### Step 2 — Defensive dedup in both spec dialogs

`src/components/branch/BranchProductSpecsDialog.tsx` and the matching tenant dialog: when building `linkedSizes` and `linkedAttrGroups`, dedup by `(catalog, sub_attribute, item_code)` before rendering. Belt-and-braces in case any future code path produces dupes.

### Step 3 — Wire the customer Document Size dropdown to the links

Investigate first (small, targeted):

- Confirm `resolve_product_options(posters, branch)` returns the size rows when called from the customer storefront (it's `SECURITY DEFINER` so RLS shouldn't be the issue, but verify).
- Confirm `resolvedRowsToSizeValues` produces 3 values (`a0/a1/a2`) given the resolved rows + master `catalog_sizes`.

Then fix the branch where it's coming back empty. Most likely fixes:

- In `useCatalogBackedOptions` for `source === "catalog.sizes"`, treat `sizeValuesFromLinks.length === 0` the same as "no links" only when `hasAnyLinks` is false; never silently fall back to the full master when links exist.
- If the join in `resolvedRowsToSizeValues` is case/whitespace sensitive on `code`, normalise before matching.

### Step 4 — Verify end-to-end on Posters

- Tenant → Products → Posters → Specs: shows 3 size rows (A0, A1, A2), not 21.
- Branch (PostNet Test Branch) → Products → Posters → Specs: same 3 rows.
- Customer storefront (PostNet Test Branch) → Posters → Step 2 Document Size: dropdown lists only A0/A1/A2.
- Toggle A1 off at branch level → customer no longer sees A1.

### Out of scope

- No changes to the Master Catalogue contents.
- No changes to print attrs / paper / finishing display logic beyond the same dedup pattern applied alongside sizes (free, same loop).
- No schema changes other than the unique index on `product_catalog_links`.

## Technical notes

- The 3-arg `resolve_product_options(p_product_family_id, p_branch_id, p_tenant_id)` overload exists but the customer hook calls the 2-arg form, which filters `scope_type = 'master'`. That's the correct source for "which items are linked to this product" — we just need its output to actually reach the customer dropdown.
- `useResolvedAllowedSizeLabels` (used by `OrderFiles` step 1) already returns the link-filtered list correctly. The bug is isolated to the step-2 configurator path that reads `options[Document Size].values` via `useCatalogBackedOptions`.
- Unique index expression needs `COALESCE` on `scope_id` and `sub_attribute` because both are nullable; otherwise NULLs bypass uniqueness in Postgres.
