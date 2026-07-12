
## Goal

Pack pricing (the fixed-pack qty ladder for Flyers etc.) is a **pricing concern**, not a product-family definition. Move it out of `Edit Product Family`, promote it to a first-class tab in **Master Pricing**, mirror it on the branch pricing page, and expose a shortcut row inside each product's **Options** list so admins can jump to it from the product configurator too. Along the way, fix the UI/UX (uppercase labels, cleaner matrix, no raw slugs).

## Scope

### 1. Remove pack pricing from Edit Product Family
`src/components/admin/ProductFamilyForm.tsx`
- Delete the `QuantityBlocksSection` block-editor UI (rows for size × paper × sides × qty × sell × cost).
- **Keep** the `quantity_mode` select (`free` vs `blocks`) — it's a product-definition flag that drives whether the pack editor is applicable. Render it as a single compact field, not a big card.
- Remove `quantity_blocks` from the form's default values / submit payload so this form no longer writes prices.

`src/pages/admin/AdminProductCatalogue.tsx`
- Remove the per-row `Packs` button + `PackPricingDialog` mount here — pack editing no longer lives on the catalogue row.

### 2. New Master Pricing tab: "Pack Pricing"
`src/pages/platform/PlatformMasterPricing.tsx`
- Wrap `RateCardEditor` and a new `MasterPackPricingEditor` in a single `Tabs` shell so **Pack Pricing** sits next to *Click Charges / Photo Prints / Business Cards*. (Alternative: extend `RateCardEditor`'s internal `TabsList` — rejected, because pack pricing isn't rate-card-shaped and mixing them muddies the component.)

New component: `src/components/pricing/MasterPackPricingEditor.tsx`
- Lists every product family with `quantity_mode = 'blocks'` (currently Flyers; future ones automatically appear).
- One card per family with an inline pack matrix — no dialog, no double-click drill-down. Users can see and edit all pack ladders directly on the page.
- Uses existing `usePackPricingOverride` / `useUpsertPackPricingOverride` hooks with `scope = "master"` semantics. For the master editor we actually want to write to `product_families.quantity_blocks` (the master ladder), not the tenant override table — so this editor calls the existing `useUpdateProductFamily` mutation with `{ quantity_blocks }`.

### 3. Rebuild the pack matrix UI/UX
Replace `PackPricingMatrixEditor` internals (used by master, tenant, and branch scopes):
- **Fix the DL / lowercase slug bug**: show the human label ("DL", "A4", "A5") from `catalog_sizes.label`, never the lowercased `code`. Same for paper (use `label` + `weight_gsm`, drop trailing "130gsm 130gsm" duplication in `paperLabel`).
- Group rows by **Size → Paper**, then a compact sub-table of Sides × Qty × Sell × Cost. This collapses today's 8 near-identical rows for one DL/130gsm stock into a single group with 4 qty rows for Single and 4 for Double.
- Provide an **"Add pack"** flow that picks Size + Paper once and seeds the standard qty tiers (100 / 250 / 500 / 1000) so admins don't hand-add 8 rows.
- "Duplicate Singles → Double" stays, but as a per-group action, not a global button.
- Keep scope-aware header ("Master / Tenant override / Branch override") + Revert-to-parent behaviour already implemented in `PackPricingDialog`.

### 4. Branch side — pricing page, not products
`src/pages/branch/BranchCatalogPricing.tsx`
- Add a third section below `MasterCatalogPricingEditor` and `RateCardEditor`: a `<BranchPackPricingEditor scope="branch" tenantId branchId />` reusing the same matrix component with the branch override hooks (already wired via `usePackPricingOverride` with `branchId`).
- Remove any Pack button we currently render on the branch products page (only the toggles page remains for enable/disable — no pricing there).

### 5. Options list shortcut
`src/components/admin/ProductOptionsEditor.tsx` (used inside the product family expand row)
- When `quantity_mode === 'blocks'`, prepend a non-editable "Pack Pricing" row above the real product options (paper stock, lamination, print edge-to-edge).
- Clicking it navigates to Master Pricing → Pack Pricing tab and scrolls / expands the corresponding family card (via a query param like `?family=<id>`).
- This gives the admin the "load pack pricing as an option" affordance the user asked for, without duplicating the editor inside the product-options table.

### 6. Data model
No migration. `product_families.quantity_blocks` (master) and `product_pack_pricing_overrides` (tenant + branch) already exist and are correctly consumed by `OrderBuild.tsx` via `resolvePackPricing`. The customer configurator keeps working with zero changes.

## Out of scope
- Customer-facing OrderBuild flow — no changes; it already resolves branch → tenant → master.
- `pricing_rules`, click charges, catalogue papers/finishing — untouched.
- Backfilling or migrating existing pack rows (all reads stay pointed at the same columns).
- DL detection fix (already shipped separately).

## Files touched
- `src/components/admin/ProductFamilyForm.tsx` — drop `QuantityBlocksSection`, keep `quantity_mode` toggle only.
- `src/pages/admin/AdminProductCatalogue.tsx` — remove Packs button + dialog mount.
- `src/pages/platform/PlatformMasterPricing.tsx` — wrap in Tabs, add Pack Pricing tab.
- `src/components/pricing/MasterPackPricingEditor.tsx` — new, inline editor for master pack ladders.
- `src/components/pricing/PackPricingMatrixEditor.tsx` — rebuilt UI (labels, grouped rows, add-pack seeding).
- `src/pages/branch/BranchCatalogPricing.tsx` — add branch pack editor section.
- `src/components/pricing/BranchPackPricingEditor.tsx` (or reuse via prop) — lists branch-overridable families inline.
- `src/components/admin/ProductOptionsEditor.tsx` — add "Pack Pricing" shortcut row.
- `src/components/pricing/PackPricingDialog.tsx` — delete (no longer used) or keep as a thin wrapper if any tenant admin page still needs the modal form; will be deleted if unreferenced after refactor.
