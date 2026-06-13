## Goal

When an order becomes "ready for production" (paid, on-account, or admin-approved), automatically generate the assembled print-ready PDF and job ticket for every job in the order, so admins don't have to click "Assemble" manually. If something fails, surface a warning badge in the admin UI rather than silently failing.

## Trigger events

Auto-fire on any of:
- `orders.payment_status` → `paid` (Stripe/Paddle/manual mark-as-paid)
- `orders.payment_status` → `on_account` (credit account submissions)
- `orders.admin_status` → `approved` (manual workflow approval)

Skip if order is `cancelled` or `completed`.

## Plan

### 1. Database migration

- Add two columns to `order_jobs`:
  - `auto_assemble_error text` — captured error message from the last auto attempt
  - `auto_assemble_failed_at timestamptz` — when it failed
- Drop the existing broken `trg_orders_payment_print_ready` trigger and `notify_enqueue_print_ready()` function.
- Recreate `notify_enqueue_print_ready()` as `SECURITY DEFINER` (search_path = public, extensions) that:
  - Fires on `payment_status` transitioning into `paid`/`on_account` OR `admin_status` transitioning into `approved`
  - Skips when new `admin_status` is `cancelled`/`completed`
  - Calls the `enqueue-print-ready` edge function via `pg_net.http_post` using the inline Supabase service-role key as the bearer token (same pattern as other internal triggers — no new secret)
- Recreate `AFTER UPDATE` trigger on `public.orders`.

### 2. `enqueue-print-ready` edge function

- Accept the trigger payload (`order_id`).
- Look up all `order_jobs` for that order.
- For each job, in parallel, fan out **both**:
  - `assemble` action (print-ready PDF)
  - `ticket` action (job ticket PDF)
- Skip jobs that already have `print_ready_pdf_path` set (unless `force=true` in payload).
- Skip jobs in RGB output families (photo prints) — no print-ready needed.
- On any failure, write the error message to `auto_assemble_error` + timestamp to `auto_assemble_failed_at` on that job row. Clear them on subsequent success.
- Best-effort: one job failing does not block siblings.

### 3. `order-engine` edge function

- When submitting a credit-account order, set `payment_status='on_account'` (currently stays `'unpaid'`, so the trigger never fires for credit orders today).

### 4. Frontend

- `AdminProductionQueue` and `OrderProductionPanel`: show an amber ⚠ badge next to any job where `auto_assemble_error` is set AND `print_ready_pdf_path` is null. Tooltip shows the error message and timestamp.
- Add a "Retry" button on the badge that re-invokes `enqueue-print-ready` with `{ order_id, force: true }`. On success, the error columns are cleared by the function.

### 5. Verification

- Place a test order, mark it paid → within ~30s the job rows should have `print_ready_pdf_path` and `job_ticket_pdf_path` populated without any admin clicks.
- Submit a credit-account order → same outcome via the `on_account` path.
- Approve an order manually via the workflow panel → same outcome via `admin_status` path.
- Temporarily break the assemble call (e.g. invalid family) → confirm amber badge appears with the error message, and Retry clears it once fixed.

## Technical notes

- The trigger uses the inline service-role key (matches the existing pattern in this DB). The key only ever travels from Postgres → your own Supabase edge function over HTTPS; it never reaches the client. No new edge-function secret is required.
- `enqueue-print-ready` keeps its existing "service-role bearer required" check, so the auth contract doesn't change — only the caller now sends the right token.
- The `auto_assemble_error` columns are write-from-edge-function only; no RLS changes needed since `order_jobs` is already admin-scoped.
