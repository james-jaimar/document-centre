## Branch-level spec toggles

Goal: let each branch enable/disable individual specs from the master catalogue — binding types, cover stocks, paper stocks, laminations, and any `product_options` value (e.g. "Frosted Clear PVC" vs "Clear PVC").

There are two distinct sources of "specs" today and we need to cover both.

---

### Source 1 — Rate card items (papers + finishing)

Tables `rate_card_papers` and `rate_card_finishing` already support `scope_type = 'branch'` rows with their own `is_active` flag. So the storage model is already in place — Sandton can keep `wire_binding_*` rows but flip `is_active=false`.

What's missing is a **UX for it**:
- The existing `BranchRateCard` page lets branches edit prices, but doesn't surface an obvious "Available at this branch" toggle, and it doesn't group the rows by what they actually represent to customers (e.g. "Binding methods", "Cover stocks", "Laminations").
- Add an "Availability" column (switch) on the Papers tab and Finishing tab inside `BranchRateCard` — backed by `is_active`.
- Add a category filter / grouping so a branch manager can see all "Binding" rows together and quickly switch off the ones they don't offer.
- When `is_active=false`, the storefront pricing engine should already exclude these — but we'll verify the storefront `useRateCard({ scope: "branch" })` calls actually filter on `is_active`, and that the configurator's binding/cover pickers respect the resulting list.

### Source 2 — Product options (JSONB values on `product_options`)

`product_options.values` is a JSONB array attached to a master `product_family` (e.g. Bound Documents has an option "Front cover" with values like `clear_pvc`, `frosted_pvc`, `leatherette_black`, etc.). Today there's no branch-level filter for these.

New table:

```
branch_product_option_overrides
  id, branch_id, product_option_id, value_code, is_enabled (bool, default true)
  unique (branch_id, product_option_id, value_code)
```

RLS: branch staff (`branch_manager`, `store_operator`, `owner`, `admin`) and platform admins can read/write rows for branches they belong to. Customers can read for the current storefront branch (public).

Resolver helper used by storefront + configurator:
- `useResolvedProductOptions(productFamilyId, branchId)` — fetches `product_options`, then strips any value whose `(option.id, value.code)` has an override row with `is_enabled=false` for that branch.

### Source 3 — Whole product family (already done)

`branch_capabilities.is_enabled` already gates entire families per branch — keep as is, no change.

---

### UI changes

1. **Branch → Products** (`src/pages/branch/BranchProducts.tsx`)
   - For each enabled family, add an "Edit specs" button → opens a drawer/dialog.
   - Inside: list every option from `product_options` for that family with its values; a switch per value toggles `branch_product_option_overrides.is_enabled`. Defaults to "on" if no row exists.
   - Empty state if the family has no JSONB options (then the user is directed to the Rate Card tabs for binding/paper).

2. **Branch → Rate Card** (`src/pages/branch/BranchRateCard.tsx`)
   - Add an `is_active` switch column on Papers + Finishing tables (already toggleable in master pricing — reuse the cell).
   - Group/filter Finishing by `category` (Binding, Lamination, Cover, Trim, etc.).
   - Header copy: "Untick anything this branch doesn't offer — it will disappear from the customer storefront."

3. **Storefront** — verify two places:
   - `useRateCard({ scope: "branch", branchId })` filters `is_active=true`.
   - `OrderBuild` / `BoundDocumentConfigurator` resolves `product_options` via the new `useResolvedProductOptions` helper so disabled values vanish from dropdowns.

---

### Technical notes

- One small migration: create `branch_product_option_overrides` + RLS + an `updated_at` trigger.
- One new hook: `src/hooks/useBranchProductOptionOverrides.ts` (list/upsert) and `useResolvedProductOptions` wrapper that composes `useProductOptions` + the overrides for the active branch.
- No data backfill needed — absent row = enabled.
- The pricing engine itself doesn't change; if a customer somehow submits a disabled value (stale tab), the cart validation will reject it because the resolved options list won't include it.

### Out of scope

- Per-branch *creation* of brand-new option values (branches can only switch master/tenant values on or off, not invent new ones).
- Bulk copy "make this branch identical to that branch" — can come later.
- Surfacing branch availability in the platform/tenant admin views (those keep showing the master/tenant superset).

### Files touched

- new: `supabase/migrations/<ts>_branch_product_option_overrides.sql`
- new: `src/hooks/useBranchProductOptionOverrides.ts`
- new: `src/components/branch/BranchProductSpecsDialog.tsx`
- edit: `src/pages/branch/BranchProducts.tsx` (add "Edit specs" entry)
- edit: `src/pages/branch/BranchRateCard.tsx` (Availability switches + category grouping)
- edit: `src/hooks/useProductOptions.ts` (add `useResolvedProductOptions(familyId, branchId)`)
- edit: `src/pages/dashboard/OrderBuild.tsx` + Bound Document configurator to consume the resolved options
