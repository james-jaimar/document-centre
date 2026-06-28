## Goal
When admin/branch staff click **View PDF**, **Download PDF**, or **Send to customer** on an invoice row, automatically check whether the stored PDF still matches the order's live totals. If it's stale (e.g. after a price/VAT/delivery change), regenerate the PDF in place and serve the fresh copy.

## Where it's stale today
- `order_invoices` stores `total_amount`, `amount_paid`, `storage_path`, `issued_at` at the moment the PDF was first generated.
- `generate-invoice-pdf` always issues a **new** invoice number and a new row when called — there's no "refresh this invoice" path.
- The three buttons (`viewInvoice`, `downloadInvoice`, `sendInvoiceEmail`) stream whatever is on disk with no freshness check, so post-edit changes (VAT backfill, delivery added, fulfillment switch, refund) never make it into the PDF the customer sees.

## Plan

### 1. Add a "refresh-in-place" mode to `generate-invoice-pdf`
- Accept an optional `invoice_id` in the request body. When present:
  - Skip `issue_invoice_number` and reuse the existing `invoice_number`.
  - Re-render the PDF using current `orders` + `order_jobs` + `order_addresses` + tax settings.
  - Overwrite the same `storage_path` (or write a new path and update the row) and `UPDATE order_invoices SET storage_path, total_amount, amount_paid, issued_at = now(), metadata = jsonb_set(...,'regenerated_at', now())`.
- Tax invoices (`kind = 'invoice'`) and proformas regenerate freely. Credit notes and receipts are immutable snapshots — skip refresh for those kinds.

### 2. Add a freshness check helper
- New helper `ensureInvoiceFresh(invoiceId)` in `src/lib/orders/mutations.ts`:
  1. Fetch the `order_invoices` row + the parent `orders` row (`total_amount`, `amount_paid`, `updated_at`).
  2. Consider stale if `kind in ('invoice','proforma')` AND any of:
     - `invoice.total_amount !== order.total_amount`
     - `invoice.amount_paid !== order.amount_paid` (for invoice kind)
     - `order.updated_at > invoice.issued_at`
  3. If stale, invoke `generate-invoice-pdf` with `{ invoice_id }` and wait for completion.
  4. Return the (possibly refreshed) invoice id + filename so the caller can stream the new bytes.

### 3. Wire the three buttons through the helper
- In `src/lib/orders/mutations.ts`:
  - `viewInvoice`, `downloadInvoice`, `sendInvoiceEmail` all call `ensureInvoiceFresh` first, then proceed exactly as today.
- `send-order-email` already pulls the invoice fresh from `order_invoices` when assembling the attachment, so once step 1 has refreshed the row, the email picks up the new bytes automatically — no changes there.

### 4. UI feedback
- In `src/components/orders/OrderInvoicesList.tsx`, show a brief "Refreshing…" state on the row while `ensureInvoiceFresh` is running (reuse the existing `sendingId`-style loading flag, generalised). No new buttons.

## Out of scope
- Auto-regenerating on every order edit (we keep it lazy — only when someone actually wants the PDF).
- Receipts / credit notes are intentionally not refreshed; they're point-in-time records.
- No change to invoice numbering — the same `INV-xxxxx` is preserved across refreshes.

## Technical notes
- Files touched: `supabase/functions/generate-invoice-pdf/index.ts`, `src/lib/orders/mutations.ts`, `src/components/orders/OrderInvoicesList.tsx`.
- No schema migration required; we reuse `metadata` JSONB for a `regenerated_at` audit trail.
- Concurrency: if two staff click at once, the second call still produces a correct PDF (idempotent overwrite); acceptable.
