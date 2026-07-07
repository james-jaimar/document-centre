## Problem

Pack pricing (`quantity_blocks`) lives only on the master `product_families` row and is only editable from Platform → Products → Edit Family. Tenant admins and branch admins have no way to see or override it, so a tenant can't set its own pack prices and a branch can't tweak them locally. The customer flow (`OrderBuild.tsx`) also reads only from the master row, so any override wouldn't be honoured yet.

## Solution

Introduce a proper cascade for pack pricing — **master → tenant → branch** — matching how catalogue toggles and price overrides already work, and expose editors at both tenant and branch level.

### 1. Database (migration)

New table `product_pack_pricing_overrides`:

```text
id              uuid pk
product_family_id  uuid  -> product_families(id) on delete cascade
tenant_id       uuid nullable  -> tenants(id) on delete cascade
branch_id       uuid nullable  -> branches(id) on delete cascade
quantity_blocks jsonb not null default '[]'::jsonb
updated_at, updated_by

Unique (product_family_id, tenant_id, branch_id)  -- one row per scope
Check: (tenant_id is not null)  -- master edits stay on product_families
```

- Reuse the existing `validate_product_family_quantity_blocks` shape via an equivalent trigger on this table (size/paper/sides/qty/price_minor validation).
- Standard `GRANT` block: `authenticated` full CRUD, `service_role` all, no `anon` grant.
- RLS:
  - Tenant rows (branch_id null): tenant owner/admin can manage; storefront anon can read rows for their `x-storefront-tenant`.
  - Branch rows: branch manager (or tenant owner/admin) can manage; anon can read when it matches storefront tenant + selected branch.
- Enable realtime on the table so editors update live.

### 2. Resolver

Add `src/lib/pricing/resolvePackPricing.ts`:

```text
resolvePackPricing({ familyMasterBlocks, tenantBlocks, branchBlocks }) → QuantityBlock[]
// precedence: branchBlocks (if non-empty) > tenantBlocks (if non-empty) > master
```

Whole-set override, not per-row merge — matches how admins think about a pack ladder ("this branch runs different pack prices").

### 3. Customer flow

`src/pages/dashboard/OrderBuild.tsx` (around line 720):
- Add a query for `product_pack_pricing_overrides` filtered by `product_family_id`, current `tenantId`, and `effectiveBranchId`.
- Feed master + tenant + branch rows through `resolvePackPricing` and use the result as `allBlocks`.
- No other logic changes — filtering by size/paper/sides and snapping stay identical.

### 4. Shared editor component

Extract the existing pack pricing matrix from `ProductFamilyForm.tsx` into `src/components/pricing/PackPricingMatrixEditor.tsx`:

Props:
```text
productFamilyId
scope: "master" | "tenant" | "branch"
tenantId?, branchId?
allowedSizes, allowedPapers, allowedSides   // already dynamic from catalogue
initialBlocks
onSave(blocks) → Promise
onRevertToParent()   // clears the override row (tenant/branch scopes only)
```

- Master usage writes into `product_families.quantity_blocks` via the existing form save (unchanged behaviour).
- Tenant/branch usage upserts a row in `product_pack_pricing_overrides`.
- Header shows the parent ladder (master or tenant) as read-only reference so admins can see what they're overriding.
- "Revert to parent" deletes the override row so cascade falls through.

### 5. Tenant admin UI

`src/pages/admin/AdminProductCatalogue.tsx`:
- Add a **Pack Pricing** action button next to Specs / Pricing on each row.
- Opens a dialog (90vw / 80vw sm, same sizing as edit product family) hosting `PackPricingMatrixEditor` in `scope="tenant"`.
- Only shown when the family has `quantity_mode = 'blocks'`.

### 6. Branch admin UI

`src/pages/branch/BranchProducts.tsx`:
- Move from bare toggle list to the same table layout used in `AdminProductCatalogue` (compact reuse), or add a secondary "Pack Pricing" button per family below the toggle.
- Opens the same editor with `scope="branch"`, showing the tenant override (or master fallback) as the parent reference.
- Available to `branch_manager`, `owner`, `admin` per `isBranchManagerRole`.

### 7. Hook

`src/hooks/useProductPackPricingOverrides.ts` with:
- `usePackPricingOverride(familyId, { tenantId, branchId })`
- `useUpsertPackPricingOverride()`
- `useDeletePackPricingOverride()`

Invalidates the family query so customer views refresh.

## Out of scope

- No changes to `pricing_rules`, `product_price_overrides`, `PriceSummary` math beyond consuming the resolved blocks.
- No backfill — absent override rows simply fall through to master.
- `quantity_mode` stays a master-only setting (a tenant/branch overriding to "free" is a bigger conversation).

## Files touched

- new `supabase/migrations/…_pack_pricing_overrides.sql`
- new `src/hooks/useProductPackPricingOverrides.ts`
- new `src/lib/pricing/resolvePackPricing.ts`
- new `src/components/pricing/PackPricingMatrixEditor.tsx`
- edit `src/components/admin/ProductFamilyForm.tsx` (delegate matrix section to shared editor)
- edit `src/pages/admin/AdminProductCatalogue.tsx` (Pack Pricing button + dialog)
- edit `src/pages/branch/BranchProducts.tsx` (Pack Pricing button + dialog)
- edit `src/pages/dashboard/OrderBuild.tsx` (query + resolver, ~10 lines)
