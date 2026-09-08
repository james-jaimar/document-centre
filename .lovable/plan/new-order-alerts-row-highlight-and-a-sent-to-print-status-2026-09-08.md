# New order alerts, row highlight, and a "Sent to print" status

Three changes to the Order Manager so nothing slips past the team.

## 1. New orders are impossible to miss

- A bell in the admin header lights up with a count of orders nobody has opened yet, and lists the most recent ones. Clicking one opens the order.
- A pop-up appears in the corner of the admin area the moment a new order arrives while someone has a tab open (no browser permission needed).
- "New" counts every freshly submitted order, including account customers whose orders are auto-approved and go straight into production.

## 2. Highlighted rows until someone looks

- Any order that has been submitted but never opened by a staff member shows a highlighted row (soft amber tint plus a small "NEW" marker next to the job number).
- The highlight clears for the whole team as soon as any staff member opens that order.
- A "Not yet opened" filter chip is added next to the existing status chips so the team can list only unattended orders.

## 3. New status: Sent to print

Order flow becomes: New → Under review → Approved → In production → **Sent to print** → QA → Ready → Dispatched → Completed.

- "In production" now means being prepared internally; "Sent to print" means it is on the press.
- Available in the status dropdown on the order, as a filter chip in the list, and shown as a badge with its own colour.
- Job-level equivalent added so a single job can be marked sent to print, and the order rolls up correctly.

## Technical notes

Database (one migration):
- `orders`: add `first_opened_at timestamptz`, `first_opened_by uuid` (nullable). Index on `(tenant_id, submitted_at)` where `first_opened_at is null`.
- Extend `orders_admin_status_check` to include `sent_to_print`; extend the job status values likewise.
- Update `rollup_order_status` so `sent_to_print` jobs roll the order to `sent_to_print`, ordered between `in_production` and `qa`, and map it to customer status `in_production`.
- New security-definer RPC `mark_order_opened(p_order_id uuid)` that sets `first_opened_at`/`first_opened_by` once (no overwrite), callable by staff of that tenant/branch only.

Frontend:
- `src/lib/orders/status-maps.ts`, `src/lib/orders/types.ts`: add `sent_to_print` to `OrderAdminStatus`, `JobStatus` and their configs (indigo/violet badge).
- `supabase/functions/order-engine/index.ts`: add `sent_to_print` to `ORDER_STATUS_MAP` with `customer_status: in_production`, `fulfilment_status: in_production`, `cascade_job_status: sent_to_print`.
- `src/pages/admin/AdminOrders.tsx` and `src/pages/branch/BranchOrders.tsx`: add the status chip, the "Not yet opened" chip, and row highlighting driven by `first_opened_at is null && submitted_at is not null`.
- `src/lib/orders/queries.ts`: select `first_opened_at`, support the unopened filter.
- `src/pages/admin/AdminOrderDetail.tsx`: call `mark_order_opened` on mount and invalidate the list/bell queries.
- New `src/hooks/useUnopenedOrders.ts` (count + recent list, realtime on `orders`) and `src/components/admin/NewOrderBell.tsx`, mounted in `AppLayout.tsx` and `BranchLayout.tsx`.
- `src/hooks/useNewOrderDesktopAlerts.ts` gains an in-app toast path so alerts fire whether or not desktop notifications are permitted.
- `src/hooks/useNewOrdersCount.ts` switches from "admin_status = new_order" to "submitted and not yet opened" so account orders are counted.

Verification: type-check, confirm the migration's status list matches the code, and check the list page shows highlighted rows that clear after opening an order.
