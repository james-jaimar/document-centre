# Document rules: VAT off, order numbers, proforma terms

Three fixes to the documents the system produces (proforma, tax invoice, credit note, quote).

## 1. When VAT is off, hide it completely

Confirmed for The 2027 Edition: tax is switched off, but the rate 15 is still stored, so the
document prints "VAT %" 15.00% against each line and a "VAT (15.00%)" total of R0.00.

Change: the document generator reads the tenant's VAT on/off switch (and the branch override
where one is set). When VAT is off:

- the VAT % column is dropped from the item table and the remaining columns spread to fill it
- the VAT total line is not printed
- the subtotal reads "Subtotal" rather than "Subtotal (Exclusive)"

When VAT is on, nothing changes from today. Applies to proformas, tax invoices, credit notes
and quotes.

## 2. Order numbers per tenant

Today every tenant draws from one shared counter with the prefix INV, which is why The 2027
Edition order reads INV-00156.

Change: each tenant gets its own order series using the prefix already set in Financial
settings (27EDIT for The 2027 Edition), padded to five digits, e.g. 27EDIT-00001. Tenants
without their own prefix keep using the existing shared series, so nothing breaks elsewhere.
Orders already placed keep the numbers they have.

## 3. Proforma terms wording

Default second term becomes:

"2. On acceptance of this proforma full payment will be required."

Same correction is applied to the default the settings screen offers, so a tenant that has
never edited their terms picks up the new wording. Tenants who have typed their own terms are
untouched. Quote defaults keep their own wording unless you want that changed too.

## Technical notes

- `supabase/functions/generate-invoice-pdf/index.ts`: load `financial.tax_enabled` (and branch
  mirror) alongside `tax_rate`; gate the `C.vat` column, the per-line `vat_rate` cell and the
  `VAT (x%)` total row on it; recompute the column x-offsets when the column is hidden.
  Same treatment in `supabase/functions/quote-pdf/index.ts`.
- Resolution follows `src/lib/tax/resolveBranchTax.ts`: `tax_enabled` defaults to true when a
  non-zero rate exists and no explicit flag is stored.
- Numbering: `public.generate_order_number` currently looks up the global `number_sequences`
  row (`tenant_id IS NULL`). Migration adds a tenant-aware overload taking `p_tenant_id`, which
  uses a tenant row when present and falls back to the global row otherwise; `next_number`
  already accepts tenant/branch. `order-engine` passes `tenant_id` at order creation, and
  tenant order sequences are seeded from `financial.invoice_prefix`.
- Terms strings live at `generate-invoice-pdf/index.ts:810` and
  `src/pages/admin/settings/DocumentsTab.tsx:15`.
