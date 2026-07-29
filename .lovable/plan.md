## Problem
`CustomerDashboard.tsx` ("My Print Centre") lists product families using `useProductFamiliesActive`, which just queries all rows where `is_active = true` on `product_families`. It does not apply:
- the tenant-level `tenant_product_toggles` (Admin → Products off), or
- the branch-level `branch_product_capabilities` (`is_enabled`, `temporary_outage`)

`NewOrder.tsx` already applies both filters correctly. So Canvas disappears from the "New Order" grid but still appears on the dashboard tiles and in any other place that reuses the raw list.

## Fix
Extract the filtered-families logic used by `NewOrder.tsx` into a single hook (e.g. `useVisibleProductFamilies`) and use it in both places.

Hook responsibilities:
1. Load master (tenant_id null) active `product_families`.
2. Load `tenant_product_toggles` for current `tenantId`; drop families explicitly disabled.
3. If an `activeBranch` exists, load its `branch_product_capabilities`; drop families where the row is missing, `is_enabled=false`, or `temporary_outage=true`.
4. Return `{ families, isLoading }`.

Then:
- Replace the inline query in `NewOrder.tsx` with the hook (behaviour unchanged).
- Replace `useProductFamiliesActive` usage in `CustomerDashboard.tsx` with the hook so the tile grid and the "Create" popover both respect toggles.

No schema / RLS changes. No customer-facing copy changes. Purely a filtering fix.

## Files touched
- `src/hooks/useVisibleProductFamilies.ts` — new
- `src/pages/dashboard/CustomerDashboard.tsx` — swap query hook
- `src/pages/dashboard/NewOrder.tsx` — swap to shared hook

## Verification
- With Canvas toggled off at tenant level: dashboard tiles + "Create" list + New Order grid all hide Canvas.
- Toggle back on: it reappears everywhere.
- Branch with Canvas capability disabled: hidden on that branch only.
