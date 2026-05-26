## Finding

When a customer lands on a storefront (`/t/:slug/...`), pricing does **not** reliably pull from that store's branch pricebook. Here's why:

- The customer's "active branch" on a storefront is tracked in `BranchContext` via `useBranch().activeBranch` (resolved from URL slug / localStorage / single-live-branch). PhotoPrintsBuilder already uses this — correctly scoped to the branch.
- But `OrderBuild.tsx` (the main builder for bound docs, flyers, brochures, business cards, etc.) reads `branchId` from `useTenantContext()`. That `branchId` comes from the signed-in user's **tenant_membership.branch_id** — which is `null` for anonymous customers and for normal customers who aren't staff of a branch.
- Result: on the storefront, `branchId` is null → rate-card calls fall back to `scope: "tenant"` and pricing rules fall back to `branch_id IS NULL`. The customer sees tenant default pricing instead of the branch's own pricebook.

The same null fallback applies to `useProductPriceOverrides` (branch overrides layer) in OrderBuild.

## Fix

Use the storefront-active branch as the source of truth for the customer flow:

1. **`src/pages/dashboard/OrderBuild.tsx`**
   - Import `useBranch` and read `activeBranch`.
   - Compute `effectiveBranchId = activeBranch?.id ?? branchId` (storefront branch wins; staff membership branch is the fallback for /admin-style usage).
   - Use `effectiveBranchId` for:
     - `useProductPriceOverrides` (branch overrides layer)
     - `rcArgs` for `useRateCardClicks` / `Papers` / `Finishing` / `PhotoPrints`
     - The `pricing_rules` query (`branch_id` filter + query key)

2. **`src/pages/dashboard/PhotoPrintsBuilder.tsx`** — already correct, no change.

3. **Sanity check** other customer-facing price-affecting hooks (`useCart`, `useOrderBuilder`, `Checkout`) — none of them re-query rate cards or pricing rules; final prices are read from the per-item `pricing_snapshot` written by OrderBuild via the order engine, so once OrderBuild is fixed the snapshot, cart totals, and checkout will all be branch-correct.

No DB changes. No changes to admin/branch staff pages (they still get their membership branch via TenantContext as today).

## Verification

- Open `/t/:slug` (or `/t/:slug/:branchSlug` for multi-branch tenants) as an anonymous visitor, start a new bound document order, and confirm:
  - Rate-card-driven prices in the right-hand summary match the branch's rate card (not tenant defaults).
  - When two branches have different prices set, switching the storefront branch URL updates the displayed price.
- Confirm admin/branch staff using `/admin` flows still see their membership-branch pricing.
