# Auto-prepare print-ready PDF + Job Ticket on payment / approval

## My take (short)

Yes, do it. Assemble and Job Ticket are deterministic from the snapshot — no human choice needed — so pre-warming them is pure win. Imposition stays manual because it needs a template choice.

Heads-up from exploration: this is **already half-built and silently broken**.
- `enqueue-print-ready` edge function exists and fans out Assemble across all jobs in an order.
- A DB trigger `trg_orders_payment_print_ready` fires on `orders.payment_status → 'paid'`.
- **But the trigger calls the function with the anon-key bearer, and the function only accepts the service-role bearer → every auto-trigger is 401'd today.** That's why nobody noticed it existed.

So this plan is: fix the existing wiring, broaden the triggers to cover all the events you picked, add Job Ticket to the fan-out, and add a failure badge.

## What auto-fires

Per your answers, auto-assemble + auto-ticket runs when any of these happen:

1. **Online payment captured** — `payment_status` transitions to `'paid'` (Stripe/PayFast webhooks already write this).
2. **Admin marks order paid manually** — same column transition, same trigger.
3. **Order placed on credit account** — `payment_status` is set to `'on_account'` (new value) at submit time for credit customers; trigger fires on that transition too.
4. **Admin clicks Approve** — `admin_status` transitions to `'approved'`; separate trigger on `orders.admin_status`.

Dedup: each `order_jobs` row only auto-fires once. If a job already has `print_ready_pdf_path` set, we skip (unless `force=true` from an admin re-click).

## What does NOT auto-fire

- **Imposition** — needs a template choice, often missing (your screenshot shows "No imposition templates configured" for Posters). Stays manual.
- **Photo prints / dye-sub families** — `getPrintReadyPlan` already returns `null` for `color_output='rgb'`. We skip those at fan-out time so we don't waste a Cloud Run slot doing nothing.
- **Cancelled / refunded orders** — trigger checks `admin_status NOT IN ('cancelled','completed')`.

## Failure handling

- Add two columns to `order_jobs`: `auto_assemble_error text`, `auto_assemble_failed_at timestamptz`.
- When `enqueue-print-ready` gets a non-2xx from `production-pdf`, it writes the error message + timestamp to those columns.
- In Order Manager job rows and `AdminProductionQueue`, show a small amber ⚠ badge next to jobs with `auto_assemble_error IS NOT NULL` and no `print_ready_pdf_path`. Tooltip = the error text.
- Admin clicking Assemble manually clears both columns on success.

## Files to change

**DB migration**
- Add `auto_assemble_error`, `auto_assemble_failed_at` to `order_jobs`.
- Update `notify_enqueue_print_ready()`:
  - Fix bearer → use service-role key from Vault (or inline secret — match how other pg_net triggers in this project do it).
  - Broaden condition: fire when `payment_status` transitions into `('paid','on_account')` OR `admin_status` transitions into `'approved'`.
  - Guard against cancelled/completed orders.
- Drop the `OF payment_status` clause on `trg_orders_payment_print_ready` and re-create as `AFTER UPDATE ON public.orders` so both column transitions can be detected inside the function.
- (Optional) add a `payment_status='on_account'` enum/check-constraint update if `payment_status` is a checked column.

**Edge function: `supabase/functions/enqueue-print-ready/index.ts`**
- Fan out **both** `action: 'assemble'` and `action: 'ticket'` per job (parallel).
- Skip jobs where `print_ready_pdf_path IS NOT NULL` unless `force`.
- Skip jobs whose product family has `color_output='rgb'` (join `product_families` via the job's snapshot or family id).
- On failure from `production-pdf`, write `auto_assemble_error` + `auto_assemble_failed_at` to that job row.
- Keep best-effort semantics (don't throw on partial failures).

**Order submit path: `supabase/functions/order-engine/index.ts`**
- When submitting a credit-account order, set `payment_status='on_account'` (currently stays `'unpaid'`). Confirm exact submit handler name during implementation.

**Frontend warning badges**
- `src/pages/admin/AdminProductionQueue.tsx`: query `auto_assemble_error`, show ⚠ chip with tooltip.
- `src/components/orders/detail/OrderProductionPanel.tsx` (or equivalent — confirm exact file): show inline error banner on the Print-ready row when `auto_assemble_error` is set and PR not yet generated. Add a "Retry" button = existing Assemble call with `force=true`, which also clears the error column on success.
- `src/lib/orders/queries.ts`: include the two new columns in admin order/job selects.

## Technical detail

```text
  orders.payment_status → 'paid' | 'on_account'        ┐
  orders.admin_status   → 'approved'                   ├─► trg_orders_payment_print_ready
                                                       │     (AFTER UPDATE, SECURITY DEFINER)
                                                       │
                                                       ▼
                                       pg_net → enqueue-print-ready
                                                       │
                          ┌────────── for each order_job ────────────┐
                          │  skip if print_ready_pdf_path set        │
                          │  skip if family.color_output='rgb'       │
                          │  POST production-pdf {assemble}          │
                          │  POST production-pdf {ticket}            │
                          │  on error → write auto_assemble_error    │
                          └──────────────────────────────────────────┘
```

Throughput note: `production-pdf` polls Cloud Run for up to 90s. An order with 10 jobs × 2 actions = 20 polls. They run in parallel (`Promise.allSettled`) and Cloud Run worker concurrency is 1, so they queue at the worker — which is fine, we don't block the user. The pg_net call has a 2s timeout so the trigger never blocks the original UPDATE.

## Out of scope

- Imposition automation.
- Re-running on snapshot changes (admin swaps a file after auto-assemble) — admin clicks Retry manually.
- Email notifying ops on failure — badge first; we can add an email later if it turns out to be noisy enough to need one.

## Verification

1. Place + pay a test order on PostNet → within ~30s the job rows show a populated `print_ready_pdf_path` and `job_ticket_pdf_path` without anyone clicking anything.
2. Admin-marks-paid path: open an unpaid order in admin, click "Mark paid" → same outcome.
3. Approve path: submit a credit-account order, click Approve → same outcome.
4. Force a failure (e.g. corrupt source PDF) → job shows amber ⚠ in Order Manager, tooltip shows the error, manual Retry clears it.
