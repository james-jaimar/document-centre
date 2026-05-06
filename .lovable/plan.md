
## Problem

The Branch Orders page (`BranchOrders.tsx`) shows a basic 5-column table with no filters, no search, no pagination, no job-level rows, and no clickable navigation to order details. Branch managers and store operators need the same Order Manager experience that tenant admins get.

## Solution

Replace `BranchOrders.tsx` with a version that mirrors `AdminOrders.tsx`, scoped to the branch:

1. **Rewrite `src/pages/branch/BranchOrders.tsx`** to use the same `useAdminOrders` hook (with `branch_id` filter) instead of a raw Supabase query. This gives:
   - Status filter chips (New, Under Review, Approved, In Production, etc.)
   - Payment status filter chips (Unpaid, Part Paid, Paid, Refunded)
   - Search bar
   - Full job-level row expansion (one row per job, showing Job #, Storefront, Company, Date, Ordered By, Product, Job Name, QTY, Gross Price, Paid icon, Ready icon, Msgs, Status badge)
   - Pagination
   - Clickable rows navigating to `/branch/orders/:id` (the detail page already exists and works)

2. **Navigation path**: Row clicks will navigate to `/branch/orders/${order.id}` instead of the admin path.

3. **Title**: Keep "Order Manager" as the heading (matching the admin experience) with subtitle "Orders assigned to your branch".

## Technical Details

- Reuse `useAdminOrders` from `src/hooks/useOrders.ts` — it already accepts `branch_id` and `tenant_id` filters
- Reuse shared components: `OrderStatusChips`, `PaymentStatusChips`, `StatusBadge`
- Reuse `ADMIN_STATUS_CONFIG`, `PAYMENT_STATUS_CONFIG` from `src/lib/orders/status-maps`
- The `PaymentIcon` and `ReadyIcon` helper components from `AdminOrders.tsx` will be duplicated inline (they're small)
- No new dependencies or database changes needed — RLS already scopes orders by branch for branch staff
