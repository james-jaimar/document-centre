# Branch-Perm Lockdown + Photo-Prints PDF Fix

Two distinct problems wrapped into one pass.

---

## Part 1 — Why the 502 (photo-prints) is happening

The branch-perm fix from the last round is working. The 502 has a different root cause:

- Order `INV-00053` is a **photo-prints** job. Its source files are JPEG images stored under `configuration.photo_prints.photos[*].original_storage_path` (verified in DB).
- The `order_documents` table for this order only contains generated invoice PDFs — **no source PDFs**.
- `production-pdf` forwards to the pdf-server's `/v1/operations/assemble-print-ready`, which runs `assemble_print_ready_for_job` (`pdf-server/app/tasks/production_tasks.py:61`).
- That task only knows how to load **PDF** assets via `load_job_bundle` (`production_orchestrator.py`). It has no code path for `product_category = 'photo-prints'`, so it raises *"No source PDFs resolved for this job"*. The edge function surfaces that as a 502.

So photo-prints have no print-ready assembler at all on the VPS.

---

## Part 2 — Branch-permission audit findings (critical leaks)

A read-only audit of every order/quote-touching edge function and RLS policy turned up the following crossover risks within a tenant. Reference list (severity in brackets):

1. **[Critical] `user_is_staff_for()` DB function** (`supabase/migrations/20260506133346_*.sql:2-18`) accepts `branch_manager` and `store_operator` **without any `branch_id` guard**. ~40 RLS policies on `orders`, `order_jobs`, `order_documents`, `messages`, `timeline_events`, `job_proofs`, `status_history`, `payments`, `order_invoices`, `quotes*` delegate to it — so a branch_manager at Branch A can read/update any record in Branch B inside the same tenant.

2. **[Critical] `order-engine` actions with no membership/branch check:**
   - `updateJobStatus` (lines 361-416)
   - `recordPaymentEvent` (lines 418-500)
   - `uploadOrderDocument` / `attachOrderDocument` (577-657)
   - `sendMessage` (720-775)
   Any authenticated user can mutate these on any order, any tenant.

3. **[Medium] `order-engine` admin-gated actions ignore `branch_id`:**
   - `cancelOrder` (804-812), `requireTenantAdmin` used by `updateOrderPricing`/`addOrderAdjustment`/`updateOrderAddress` (868-880). A branch-scoped admin can act outside their branch.

4. **[High] `generate-invoice-pdf`** (214-220) only checks `getUser()` — no membership/branch check before generating + storing an invoice for an arbitrary `order_id`.

5. **[High] `document-access`** uses the caller's JWT + RLS, which inherits the gap in #1 — fixing #1 fixes this automatically.

6. **[Medium] `send-order-email` and `enqueue-print-ready`** have **no incoming auth check at all**. Anyone hitting the URL with a valid `order_id` can trigger transactional emails or print queues.

7. **Already-good reference pattern:** `production-pdf/index.ts:65-98` is the only function correctly enforcing branch-match for branch-scoped memberships. We will copy that pattern everywhere else.

---

## Plan

### Step A — Lock down `user_is_staff_for` (DB migration)

Replace with a branch-aware variant. Two options; recommend (i):

(i) Keep the existing 2-arg `user_is_staff_for(app_id, tenant_id)` as **tenant-wide only** (drop `branch_manager`/`store_operator` from its allowed-role list — they are not tenant-wide). Add a new `user_is_staff_for_branch(app_id, tenant_id, branch_id)` that:
   - Returns true for platform_admin
   - Returns true for tenant-wide staff (owner/admin/sales/production/accounts) regardless of branch
   - Returns true for branch_manager/store_operator **only** when their `tm.branch_id = p_branch_id`

Update every RLS policy on order/quote-scoped tables to call `user_is_staff_for_branch(app_id, tenant_id, branch_id)`, passing the row's `branch_id` column.

### Step B — Patch order-engine actions

In `supabase/functions/order-engine/index.ts`, add a small helper `assertOrderStaffAccess(supabase, admin, userId, order)` that mirrors the `production-pdf` pattern. Call it at the top of:
- `updateJobStatus`
- `recordPaymentEvent`
- `uploadOrderDocument` / `attachOrderDocument`
- `sendMessage`
- `cancelOrder` (admin-only)
- `requireTenantAdmin`-gated actions (`updateOrderPricing`, `addOrderAdjustment`, `updateOrderAddress`) — extend to enforce branch match.

### Step C — Patch `generate-invoice-pdf`

Add the same membership + branch-match check after `getUser()`, before loading the order with the admin client.

### Step D — Lock down internal-only endpoints

`send-order-email` and `enqueue-print-ready`: require either a `SERVICE_ROLE` bearer or a new shared `INTERNAL_FUNCTION_SECRET` header. Update the DB triggers/cron that call them to send the secret.

### Step E — Photo-prints print-ready assembler (VPS)

Add a new branch in `assemble_print_ready_for_job` (or a sibling task) for `product_category == 'photo-prints'`:

1. Read `configuration.photo_prints.photos[*]` (size slug, finish, border, list of photos with `original_storage_path`, `croppedAreaPixels`, `rotation`, `zoom`, `quantity`).
2. Resolve print-size mm from the same `rate_card_photo_prints`/`paperSizes` source the customer chose (`4x6 = 102×152mm`).
3. For each `photos[]` entry, download from S3, apply `croppedAreaPixels` + `rotation`, render a single-page PDF at print size (full-bleed when border = `none`; white frame when border slug specifies one) using ReportLab/PIL at 300 DPI.
4. Concatenate `quantity` copies per photo into the merged print-ready PDF. Write back to `order_jobs.print_ready_pdf_path` (existing path).

No changes needed in the edge function — once the VPS task returns `completed`, the poll loop picks up the storage path.

### Step F — Verify

1. Re-trigger `production-pdf` for `da4d9c88-6357-4d52-b7e5-cf6d8bdb33b3` and confirm the merged JPEG-derived PDF appears.
2. Spot-check branch isolation:
   - Sign in as a Branch A `branch_manager` and confirm Branch B orders/quotes/messages return RLS-empty.
   - Confirm `updateJobStatus` for a Branch B job returns 403 from order-engine.
3. Re-run the existing tenant-isolation test (`src/test/tenant-isolation.test.tsx`) and the Supabase linter.

---

## Out of scope

- Refactoring `user_is_staff_for` callers in client code (the UI already uses `TenantContext`; only DB + edge functions change).
- Per-role granularity inside branch (e.g. limiting `store_operator` vs `branch_manager` actions). The current pattern keeps both as branch-bound staff.
- Cloudprinter / PMP path (separate auth token already in place).
- The CORS errors on S3 thumbnails in the screenshot — that's the admin gallery preview, unrelated to PDF generation; can address separately if you want.

---

## Tech detail (for reference)

- DB migration creates the new `user_is_staff_for_branch` function with `SECURITY DEFINER`, `STABLE`, `SET search_path = public`. Each policy update is `DROP POLICY` + `CREATE POLICY` in the same migration.
- Edge function helper signature: `assertOrderStaffAccess(admin: SupabaseClient, userId: string, order: { tenant_id: string; branch_id: string | null }): Promise<void>` — throws an `HttpError(403)` on failure.
- VPS photo-prints task lives at `pdf-server/app/tasks/production_tasks.py`; image composition via Pillow + ReportLab; storage upload via the existing `StorageService.upload_bytes` used by other assemblers.
