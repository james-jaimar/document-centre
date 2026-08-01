## What's actually happening (verified)

- Order `INV-00131` (paid, R84.80) has **only one** `order_invoices` row: `PPC-INV-2026-01133`, kind `proforma`. No tax invoice exists, so the customer area correctly shows what's there — a proforma.
- Older paid orders (INV-00110, INV-00098, INV-00097…) do have both a proforma and an `invoice` row, because those were marked paid **manually by staff**: `order-engine`'s `recordPaymentEvent` action generates a tax invoice and sends the "payment_received" email when status is `paid`.
- The **online payment webhooks do not do this**. `supabase/functions/payfast-itn/index.ts` sets `orders.payment_status = 'paid'`, `amount_paid`, and the payment/attempt rows, then stops — it never calls `generate-invoice-pdf` and never triggers the payment email. `supabase/functions/stripe-order-webhook/index.ts` has the same gap (no outbound calls at all).
- The customer/admin/branch invoice list (`src/components/orders/OrderInvoicesList.tsx`) is a flat list of every invoice row with no paid indicator and no notion of a proforma being superseded.

So it's two separate issues: the tax invoice was never generated, and the UI has no paid state.

## Plan

### 1. Issue the tax invoice when an online payment succeeds
In `payfast-itn` (and the same block in `stripe-order-webhook`), after the order is successfully marked paid, fire the same side effects staff-initiated payments already get:
- call `generate-invoice-pdf` with `kind: "invoice"` (service-role auth, best-effort/non-fatal, wrapped in try/catch so a PDF failure never fails the webhook ack),
- then trigger the `payment_received` order email with the new `invoice_id` attached.

Guard against duplicates: skip if an `invoice`-kind row already exists for the order, and skip when the ITN is a refund/cancel notification.

### 2. Show paid state in the invoice list (customer, branch, admin)
In `OrderInvoicesList.tsx`:
- Fetch the order's `payment_status` / `amount_paid` / `total_amount` alongside the invoices.
- Once a `kind = 'invoice'` row exists, present it as the primary document ("Tax Invoice") with a green **PAID** badge (or "Part paid" when `amount_paid < total_amount`), plus the paid date from the payment record.
- Collapse the superseded proforma behind a small "Show earlier documents" toggle rather than deleting it — proformas stay retrievable for audit, but the customer sees the paid tax invoice first.
- Keep the same component for admin/branch so all three surfaces stay consistent.

### 3. Backfill
Generate the missing tax invoice for `INV-00131` (and any other paid order that has a proforma but no `invoice` row) by invoking the existing generation action once, so current orders show correctly.

## Technical notes

- Files touched: `supabase/functions/payfast-itn/index.ts`, `supabase/functions/stripe-order-webhook/index.ts`, `src/components/orders/OrderInvoicesList.tsx`. No schema change — `order_invoices.kind` already supports `invoice`, and `generate-invoice-pdf` already renders "TAX INVOICE" with the paid amount block.
- Invoice numbering continues to use the existing per-branch sequence, so the tax invoice gets its own number distinct from the proforma.
