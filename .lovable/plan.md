## Goals

1. Replace the raw UUID slice ("Order e32573ce") on the customer dashboard's Order Tracking widget with the human-readable `order_number` (e.g. `INV-00069`).
2. Give branch operators (and admins) a real workflow tool: a status picker on each order/job that transitions through the lifecycle (New → Under Review → Approved → In Production → QA → Ready → Completed, plus On Hold / Cancelled), with the right side-effects and email triggers.
3. Add dispatch handling: when a delivery order is marked Ready, prompt for a tracking number + carrier, and on "Mark Dispatched" send the dispatched email to the customer with the tracking info.

---

## 1. Customer dashboard — human-readable order references

**File:** `src/pages/dashboard/CustomerDashboard.tsx`

- Extend `useTrackingOrders` to select `order_number` alongside the existing columns.
- In the Order Tracking list (around line 566), render `order.order_number ?? \`Order ${order.id.slice(0,8)}\`` so it shows e.g. `INV-00069` (and keep the UUID slice only as a fallback for legacy rows with no number).
- Same treatment in `getOrderDisplayName` (line 196) — prefer `order_number` over UUID slice.

No other surfaces are affected — admin/branch already display `INV-xxxxx`.

---

## 2. Branch / admin workflow — status transition controls

### 2a. Database — new columns + state-history helpers

Migration adds to `public.orders`:
- `tracking_number text` (nullable)
- `tracking_carrier text` (nullable)
- `dispatched_at timestamptz` (nullable)
- `ready_at timestamptz` (nullable)
- `completed_at` already exists per the queries.

No new tables, no RLS changes (existing order policies cover these columns).

### 2b. New `order-engine` action: `updateOrderStatus`

Handles order-level transitions and is the single entry-point for the workflow:

```
payload: {
  order_id,
  admin_status,                  // target admin status
  reason?: string,
  tracking_number?: string,      // required when transitioning to "dispatched"
  tracking_carrier?: string,
}
```

Logic:
1. `assertOrderStaffAccess` (existing helper).
2. Map `admin_status → customer_status` and `fulfilment_status` using the matrix below.
3. Apply allowed transitions (reject illegal jumps like `cancelled → in_production`).
4. Update `orders` row (status fields + `ready_at` / `dispatched_at` / `completed_at` timestamps as appropriate + tracking fields when dispatching).
5. Cascade to `order_jobs.job_status` for jobs still in earlier states (e.g. when order becomes `in_production`, push pending jobs to `in_production`; when `completed`, push all to `completed`). Per-job overrides remain possible via `updateJobStatus`.
6. Write `status_history` + `timeline_events` rows (existing pattern).
7. Fire `send-order-email` (fire-and-forget, like the existing `payment_request` call) for these transitions:
    - `admin_status='ready_for_dispatch'` AND `fulfillment_type='collection'` → `ready_for_collection`
    - `admin_status='ready_for_dispatch'` AND `fulfillment_type='delivery'` → no email yet (waiting for tracking)
    - separate transition `dispatched` (delivery only) → `dispatched` email; pass tracking_number/carrier through `extra` for the body.
    - `admin_status='completed'` → existing `order_completed` event if one exists, otherwise skip.

### Status mapping matrix

| admin_status         | customer_status     | fulfilment_status | timestamp set | email                    |
|----------------------|---------------------|-------------------|---------------|--------------------------|
| new_order            | awaiting_payment    | pending           | —             | —                        |
| under_review         | awaiting_payment    | pending           | —             | —                        |
| approved             | in_production       | pending           | —             | —                        |
| in_production        | in_production       | in_production     | —             | —                        |
| qa                   | in_production       | in_production     | —             | —                        |
| ready_for_dispatch   | ready               | ready             | ready_at      | ready_for_collection*    |
| dispatched (delivery)| dispatched          | dispatched        | dispatched_at | dispatched (w/ tracking) |
| completed            | completed           | delivered/collected| completed_at | —                        |
| on_hold              | on_hold             | (unchanged)       | —             | —                        |
| cancelled            | cancelled           | cancelled         | —             | —                        |

`*` only when `fulfillment_type='collection'`.

### 2c. Frontend client

`src/lib/orders/mutations.ts`: add `updateOrderStatus({...})` wrapper that calls the new engine action (mirrors existing `updateJobStatus`).

### 2d. UI — Order Status Workflow card

New component `src/components/orders/detail/OrderWorkflowPanel.tsx`, rendered in `OrderSummaryTab` directly under the existing status row.

- Shows current `admin_status` badge.
- Renders the next legal transitions as primary action buttons (e.g. when status = `new_order`: [Mark Under Review] [Approve] [Cancel]; when `approved`: [Start Production] [On Hold]; etc.).
- A "More…" dropdown exposes On Hold and Cancel everywhere they're legal.
- When the target is `ready_for_dispatch` for a delivery order, the button label is "Mark Ready" and after success the panel reveals a small inline form for `Carrier` + `Tracking Number` and a [Mark Dispatched & Notify Customer] button. Cancel/Reason prompts use a small dialog where useful (cancel always requires a reason).
- Uses `updateOrderStatus` and invalidates the order detail query on success; toast on success / error.

Per-job status changes remain available on `JobDetailPanel` (already shows `JOB_STATUS_CONFIG` badges) — we add a small inline `Select` next to the job status badge that calls the existing `updateJobStatus` mutation for fine-grained per-job overrides. This is optional polish but cheap and was the original "we used to have it" behaviour.

### 2e. Wiring

- `OrderSummaryTab` receives `order` already; pass `order` (incl. `fulfillment_type`, `tracking_number`, `dispatched_at`) to `OrderWorkflowPanel`. No prop changes needed in `BranchOrderDetail` / `AdminOrderDetail` beyond what they already pass.
- Reuse `ADMIN_STATUS_CONFIG` for labels and existing `StatusBadge` for visuals.

---

## 3. Email templates (`send-order-email`)

Already supports `ready_for_collection` and `dispatched` event keys (verified in `supabase/functions/send-order-email/index.ts`). Two small updates:
- Extend the `dispatched` body to include tracking number + carrier when present (`c.deliveryLine` already exists — populate it from the order's new `tracking_number`/`tracking_carrier` when building `ctx`).
- No new templates needed for the other transitions; we intentionally do not spam customers on internal status changes (Approved, In Production, QA) — only on Ready/Dispatched.

---

## Technical details

**Files added**
- `supabase/migrations/<ts>_order_tracking_fields.sql` — adds tracking + timestamp columns.
- `src/components/orders/detail/OrderWorkflowPanel.tsx` — workflow UI.

**Files edited**
- `supabase/functions/order-engine/index.ts` — add `updateOrderStatus` action + switch case + cascade logic + email dispatch.
- `supabase/functions/send-order-email/index.ts` — include tracking info in `dispatched` body.
- `src/lib/orders/mutations.ts` — add `updateOrderStatus` wrapper.
- `src/lib/orders/queries.ts` — already returns `*` from `orders`, so tracking columns flow through automatically (verify after migration).
- `src/components/orders/detail/OrderSummaryTab.tsx` — render `OrderWorkflowPanel`.
- `src/components/orders/detail/JobDetailPanel.tsx` — optional inline per-job status select using `updateJobStatus`.
- `src/pages/dashboard/CustomerDashboard.tsx` — show `order_number` in Order Tracking widget + helper.

**Out of scope**
- Auth/RLS changes (existing branch_manager access already works after the recent migration).
- Production/file pipeline changes.
- Adding new email templates beyond what already exists.
- Photo-prints VPS pipeline (separate workstream).
