# Trade invoices missing the seller's details

The Impress Print invoice (CAL-2026-26002) shows only "Impress Press (Pty) Ltd" with empty Tel
and EMail, and no VAT or registration number.

## Why

Confirmed against the live records: the trade orders created by the supplier link are not
attached to any branch. Impress Print's contact details, address and VAT number all live on
their branch (Impress Print Durban — phone 031 263 2755, wecan@impressweb.co.za, 142 Intersite
Avenue, VAT 4890102587), and the invoice only reads them when the order names a branch. The
2027 Edition's own orders do name a branch, which is why theirs look right. The company name on
the trade invoice is falling through to the tenant name, which is the only piece that survives.

## The fix

1. When an order is copied to the supplier, attach it to the supplier's branch — the single
   active branch when there is only one, otherwise the branch that the sold product belongs to.
   Trade orders then pick up the supplier's letterhead, address, VAT number and banking exactly
   like their own orders.
2. Make the invoice resilient anyway: when an order has no branch, fall back to the tenant's
   single active branch before falling back to bare tenant details. That repairs any existing
   order without a branch, not just trade ones.
3. Re-issue the invoice for CAL-26002 (and CAL-26001) so the corrected versions replace the ones
   already stored.

Nothing changes for orders that already carry a branch.

## Technical notes

- `supabase/functions/_shared/supplier-mirror.ts`: resolve a `branch_id` for the mirrored order
  (query `branches` for the supplier tenant, `is_active = true`; use it when exactly one row, else
  prefer the branch on the supplier's product assignment) and include it on the insert, so
  `branch_settings` financial overrides and `branch_private` both resolve.
- `supabase/functions/generate-invoice-pdf/index.ts` (lines 285–314): when `order.branch_id` is
  null, look up the tenant's single active branch and use its id for the `branches`,
  `branch_private` and `branch_settings` reads. `resolveFromParty` needs no change.
- Bump `INVOICE_RENDERER_VERSION` / `CURRENT_INVOICE_RENDERER_VERSION` to 3 so stored PDFs are
  treated as stale and re-rendered on next view, download or email.
- Deploy `generate-invoice-pdf` and `order-engine`, then regenerate the two CAL invoices.
