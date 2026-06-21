## Goal

Consolidate the branch portal's pricing into a single **Catalogue Pricing** page and fix the two scope bugs that make the current branch view unusable (paper stocks not editable, finishing won't pull from tenant).

## What the branch will see after this

Sidebar: remove **Pricing Rules** and **Rate Card** entries. Keep just one item — **Catalogue Pricing**.

One page (`/branch/catalog-pricing`) with the existing layout, in this order:

1. **Paper Stocks** — editable sell-price cells per (paper × size), same UI master/tenant use.
2. **Finishing** — editable sell-price rows, populated by "Pull missing from tenant".
3. **Click Charges** — sub-tab of the second card.
4. **Photo Prints** — sub-tab.
5. **Business Cards** — sub-tab.

Two action buttons at the top of the page stay: **Pull missing from tenant** and **Re-sync from tenant**.

## Changes

### Sidebar & routes
- `src/components/BranchSidebar.tsx`: remove the two nav entries for `/branch/pricing` (Pricing Rules) and `/branch/rate-card` (Rate Card). Keep `/branch/catalog-pricing` as the single pricing entry.
- `src/App.tsx`: remove the `/branch/pricing` and `/branch/rate-card` routes and their imports.
- Delete `src/pages/branch/BranchPricing.tsx` and `src/pages/branch/BranchRateCard.tsx`.

### Branch catalogue pricing page
`src/pages/branch/BranchCatalogPricing.tsx` already renders both blocks (paper/finishing editor + click/photo/business-card editor). Leave its structure alone; just confirm it remains the single destination.

### Fix 1 — Paper stocks not editable at branch scope
Root cause: the branch view's "size columns" come from the union of every paper's `stocked_sizes` array. When the branch was cloned from the tenant, paper rows landed without `stocked_sizes` populated, so the table renders only the Flags column with red "No sizes set" badges and no input cells (matches the screenshot).

Fix in the `clone_tenant_catalog_to_branch` / `resync_branch_catalog_from_tenant` SQL functions: include `stocked_sizes` (and any other catalog-paper columns currently missed: `is_cover_stock`, `is_edge_to_edge_only`, `category`, `finish`, `weight_gsm`, `label`) in the INSERT … SELECT from the parent tenant's `catalog_papers`. Same audit for `catalog_finishing` so the finishing tab works after pull. After the migration, re-running "Re-sync from tenant" on the branch will populate the size columns and the cells will be editable.

### Fix 2 — "Pull missing from tenant" doesn't populate Finishing
Same family of bug: the existing branch-cascade RPC either skips `catalog_finishing` + `catalog_finishing_prices` or filters them by a scope predicate that excludes tenant rows. Audit the function body and ensure both finishing tables are cloned with the same scope rewrite already applied to papers/paper_prices.

I'll verify by querying `catalog_finishing` at the branch scope before/after the migration runs.

### Out of scope
- No changes to master or tenant pricing pages.
- No changes to the customer-facing pricing resolution — it already reads branch → tenant → master cascade.
- `pricing_rules` data is not migrated anywhere; removing the nav simply hides the now-unused editor.

## Verification

1. Branch sidebar shows a single **Catalogue Pricing** entry.
2. On `/branch/catalog-pricing`, click **Re-sync from tenant** → Paper Stocks table shows size columns (A4/A3/SRA3/etc.) with editable inputs, no "No sizes set" badges.
3. Switch to **Finishing** tab → rows appear after pull; sell/cost editable.
4. Click Charges / Photo Prints / Business Cards sub-tabs still editable as today.