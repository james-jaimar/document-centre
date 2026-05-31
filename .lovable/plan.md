Two changes to the branch portal: refresh the dashboard with a richer e-commerce style overview, and fix the empty Customers list.

## 1. Fix Branch Customers (empty list)

Database check confirms PostNet Sandton City has 16 non-cart orders for `jimmybhawkins@gmail.com` (plus 12 guest orders with no profile). The `get_branch_customers` RPC is wired correctly and the `branch_manager` role passes the `caller_has_branch_access` guard — so the customer should appear.

The likely cause is one of:
- A silent RPC error swallowed by the hook (it `throw`s but the UI only shows the empty state).
- A stale React Query cache from before recent role/migration changes.

**Fix:**
- In `useBranchCustomers`, surface errors (return `error` and render an inline error state in `BranchCustomers.tsx` instead of "No customers...").
- Verify in preview after the change — if an error appears, capture it and patch the RPC or RLS path. If not, the page will show jimmybhawkins as expected.
- No schema changes anticipated; only add a migration if the error reveals one.

## 2. Refresh Branch Dashboard

Current `BranchDashboard.tsx` shows only 3 plain count cards (Pending / In Production / Complete). Replace with a modern operations overview while keeping it lightweight and on-brand (utilitarian admin styling, no glassmorphism).

**New layout (single file edit to `src/pages/branch/BranchDashboard.tsx` + small query hook):**

```text
┌───────────────────────────────────────────────────────────┐
│ KPI strip (6 compact cards)                               │
│ Pending • In Production • Ready • Completed today •       │
│ Revenue today • Revenue this month                        │
├──────────────────────────┬────────────────────────────────┤
│ Orders – last 14 days    │ Today's queue (top 5)          │
│ (sparkline / mini bar)   │ order #, customer, status,     │
│                          │ amount → links to detail       │
├──────────────────────────┼────────────────────────────────┤
│ Status mix (donut)       │ Recent activity (5 events from │
│ new / production / ready │ status_history for this branch)│
└──────────────────────────┴────────────────────────────────┘
```

**Data sources (all already exist):**
- `orders` filtered by `tenant_id` + `branch_id`, grouped by `admin_status`, `created_at::date`, `total_amount`.
- `status_history` joined to `orders` for this branch (last 5 entries).

**Implementation notes:**
- Add a single `useBranchDashboard` hook that runs the aggregate queries in parallel via React Query.
- Use `recharts` (already in project) for the sparkline and donut — small, no new deps.
- Reuse existing `Card`, `Badge`, `Skeleton`, semantic tokens. No new colors.
- All cards link through to the existing Orders page with the relevant filter so the dashboard becomes a true entry point.

## Out of scope
- No changes to Orders, Quotes, Products, Pricing, Rate Card, Delivery.
- No sidebar / navigation changes.
