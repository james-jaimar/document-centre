# Invoice / pro forma: customer VAT number and editable terms

Verified against the uploaded `CAL-2026-01142.pdf`, the invoice generator, and the database.

## 1. The "VAT Reg No." column shows the seller's VAT number

Confirmed cause: in `generate-invoice-pdf`, the metadata strip under the address boxes builds its
columns as `Account No.` (hard-coded empty) and `VAT Reg No.` = `from.vat_number` — `from` is the
*selling* party (branch, then tenant). The tenant "Impress Press (Pty) Ltd" has
`vat_number = 4890102587`, which is why the same number prints twice: once correctly in
"Invoice From", once wrongly in the customer strip.

Fix: those two columns belong to the **customer**.

- Resolve the buying company for the order: `orders.ordered_by_profile_id` ->
  `tenant_memberships.company_id` (same tenant, active) -> `customer_companies`.
- `VAT Reg No.` = the company's `vat_number`; `Account No.` = the company's `mis_account_number`.
- No company or no value: leave the cell blank rather than falling back to the seller's number.
- The seller's VAT number stays exactly where it is, in the "Invoice From" block.

## 2. Terms and Conditions text is a hard-coded default

Confirmed: the generator already looks for tenant settings `invoices.proforma_terms` and
`invoices.invoice_terms` and only falls back to the hard-coded
"1. This Proforma is valid for 7 working days. / 2. On acceptance of this proforma a 50% deposit
will be required." There is no screen anywhere that writes those keys, so the default always wins.

Fix: add the editing surface.

- In Tenant Settings > Documents, add a "Terms and Conditions" section with two multi-line fields:
  Pro forma terms and Invoice terms, each pre-filled with the current default and with a
  "Reset to default" action.
- Save them as `documents.proforma_terms` / `documents.invoice_terms`; the generator will read the
  `documents` category first, then the legacy `invoices` category, then the built-in default, so
  nothing already configured is lost.
- Apply the same tenant terms to the quote PDF, which carries its own copy of the hard-coded text.

## 3. Footer text (for completeness)

The footer disclaimer already reads `documents.legal_footer_text` from Tenant Settings >
Documents and only falls back to the exchange-rate paragraph when that field is empty — so it is
already admin-settable. If it still prints the old text on the Impress documents, the field is
blank for that tenant; I will set it once the terms fields go in.

## Technical notes

- `supabase/functions/generate-invoice-pdf/index.ts`: add a customer-company lookup alongside the
  existing tenant/branch fetch, use it for the metadata strip, and widen the terms lookup.
- `supabase/functions/quote-pdf/index.ts`: read the same tenant terms setting.
- `src/pages/admin/settings/DocumentsTab.tsx`: two new textareas wired through the existing bulk
  settings save.
- No schema migration needed — `customer_companies.vat_number` and `mis_account_number` already
  exist, and terms live in `tenant_settings`.
