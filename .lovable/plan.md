## Diagnosis

The proforma you just received (`INV-2026-01062`) still has the old, plain layout:

```
PostNet South Africa | PostNet                PROFORMA INVOICE
PostNet (Pty) Ltd                             Invoice No: …
support@postnet.co.za                         Order No: …
…
Description           Qty   Unit Price   Total
…
Subtotal / Delivery / VAT / Total / Amount Due
```

However, `supabase/functions/generate-invoice-pdf/index.ts` on disk already contains the new PostNet-style layout that matches the updated quote PDF:

- "Invoice From:" bordered box (top-left) with trading name, address, Tel, Fax, EMail
- Logo + `PROFORMA INVOICE` title + number stacked top-right
- "Invoice To:" and "Deliver To:" bordered boxes side-by-side
- Brand-tinted metadata strip (Account No, VAT Reg No, Proforma Date, Order Number, Representative, Proforma Number)
- 7-column items table (Item Code, Description, Quantity, Unit Price, Disc %, VAT %, Line Total) with spec key/value pairs under each line
- Terms + Banking + Acceptance signature block (left), totals stack (right)
- Disclaimer + per-page "Created / Page X of Y" footer

In other words: the code is right, the deployed copy is stale. The earlier redeploy in this thread only pushed `send-order-email` and `email-dispatcher`; `generate-invoice-pdf` was edited but never redeployed, so production is still running the previous build.

## Fix

1. Redeploy `generate-invoice-pdf` (single edge function, no code changes).
2. Regenerate the proforma for this order from the admin UI (it issues a new invoice number) and confirm:
   - PROFORMA INVOICE title + number top-right
   - Invoice From / Invoice To / Deliver To boxes render
   - 7-column items table with spec breakdown under the line
   - Terms, Banking (when EFT is enabled), Acceptance signature lines
   - Totals stack on the right matches the quote PDF

## Files touched

- None. Deploy-only.

## Out of scope

- Any further design tweaks to the invoice layout — call those out separately once you've seen the redeployed output.
- The quote PDF, the email template, attachments, or footer email work already done in this thread.
