# Make stored invoice PDFs refresh after a layout change

## The problem

An invoice or proforma PDF is written to storage once and then reused. The system only re-renders it when the order's totals change, the order is edited, or the tenant's document/financial/branding settings change. A change to the document layout itself — like removing VAT or rewording the terms — is invisible to that check, so everyone keeps getting the old file.

Quotes already re-render on every open, so they are unaffected.

## The fix

1. Stamp every generated invoice/proforma with the layout version it was produced from.
2. Treat a PDF produced by an older layout as out of date, exactly like an out-of-date total.
3. Bump the version number whenever the invoice layout changes, so all stored PDFs quietly rebuild the next time they are viewed, downloaded or emailed.
4. Apply the same staleness check on the server side, so invoices attached to outgoing emails are refreshed too — today only the in-app view and download do this.
5. Add a "Regenerate" action on the order's documents area so staff can force a fresh copy without waiting for the automatic check.

Once this is in, your existing proforma for order INV-00156 rebuilds on the next open and shows no VAT and the new terms wording.

## Technical detail

- Add a nullable integer column `renderer_version` to `public.order_invoices` (migration). Existing rows stay null, which counts as stale.
- Add `const RENDERER_VERSION = 2;` in `supabase/functions/generate-invoice-pdf/index.ts` and write it on both the insert (line ~1023) and the refresh update (line ~1001).
- Extend `ensureInvoiceFresh` in `src/lib/orders/mutations.ts`: select `renderer_version` and add `(inv.renderer_version ?? 0) < CURRENT_INVOICE_RENDERER_VERSION` to the `stale` expression. Export the constant from a shared module (`src/lib/orders/invoiceRenderer.ts`) so the number lives in one place next to a comment telling future changes to bump it.
- Server side: in `supabase/functions/send-order-email/index.ts` (the `invoice_id` branch, ~line 323) and `supabase/functions/_shared/payment-invoice.ts`, call `generate-invoice-pdf` with `{ invoice_id }` when the stored row's `renderer_version` is below current, before attaching.
- UI: add a "Regenerate PDF" item next to the existing download action in the order documents list, invoking `generate-invoice-pdf` with `{ invoice_id }` and re-fetching.
- No change needed for quotes — `quote-pdf` re-renders on every call.
