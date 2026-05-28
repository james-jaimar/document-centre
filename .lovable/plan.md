# Branch Portal — Delivery page

Branch managers currently have no in-portal access to delivery pricing. The branch-scoped `DeliveryEditor` already exists (used at `/admin/branches/:id/delivery`); we just need to surface it inside the Branch portal so they can self-serve.

## Changes

1. **New page** `src/pages/branch/BranchDelivery.tsx`
   - Reads `tenantId` and `branchId` from `useTenantContext`.
   - Renders `<DeliveryEditor scope="branch" tenantId={tenantId} branchId={branchId} title="Branch Delivery" description="Your branch's own delivery zones, methods and rates. Use 'Reset from tenant' to seed from the tenant defaults, then customise prices and toggle methods on/off." />`.
   - Mirrors the empty-state guards in `BranchRateCard.tsx` (no tenant / no branch assigned).

2. **Route** in `src/App.tsx`
   - Add `<Route path="/branch/delivery" element={<BranchDelivery />} />` inside the existing `BranchLayout` block, alongside `/branch/rate-card`.

3. **Sidebar** `src/components/BranchSidebar.tsx`
   - Add a `Delivery` nav item (e.g. `Truck` icon from lucide) between **Rate Card** and **Settings**, pointing to `/branch/delivery`.

## Notes / no DB work needed

- The branch-override DB schema, RLS, `quote_delivery_rate` scope priority, and `clone_tenant_delivery_to_branch` were all delivered in the prior migrations.
- `DeliveryEditor` already supports `scope="branch"` (Zones, Methods with branch overrides, Rates, "Reset from tenant"). This is purely a routing + navigation surface.
