
## Goal

The Quote PDF (`quote-pdf`) was recently rebuilt to mirror a real PostNet quote (bordered boxes, branded metadata strip, 7-column line-item table with VAT %, terms, banking, acceptance, disclaimer). The Invoice / Proforma PDF (`generate-invoice-pdf`) still uses the older red-banner design from the screenshot. This task brings them in line so the Quote → Proforma → Invoice trio looks like one consistent document family.

## Scope

Only `supabase/functions/generate-invoice-pdf/index.ts` is rewritten. No DB changes, no UI changes, no changes to `quote-pdf`. The same edge function continues to power both `TAX INVOICE` and `PROFORMA INVOICE` (and `CREDIT NOTE` / `RECEIPT`) — only the document title swaps based on `kind`.

## New layout (mirrors `quote-pdf`)

```text
┌──────────────────────────────┬──────────────────────────┐
│  [Invoice From:] chip        │      [tenant logo]       │
│  Branch trading name (bold)  │                          │
│  Address lines               │   TAX INVOICE  (or       │
│  Tel / Fax / EMail           │   PROFORMA INVOICE)      │
│                              │   INV-2026-01062         │
├──────────────────────────────┴──────────────────────────┤
│  [Invoice To:]            │  [Deliver To:]              │
│  Customer name (bold)     │  Customer name              │
│  Email                    │  Address / Same as billing  │
├─────────────────────────────────────────────────────────┤
│ Account No. │ VAT Reg No. │ Invoice Date │ Order # │ Rep │ Invoice # │
│   value     │   value     │    value     │  value  │  v  │   value   │
├─────────────────────────────────────────────────────────┤
│ Item Code │ Description           │ Qty │ Unit │ Disc% │ VAT% │ Line Total │
│    1      │ Bound Documents       │ 1.00│ 55.20│       │15.00%│   55.20    │
│           │  Size: A4   Binding: Comb Binding (Black)              │
│           │  Pages: 32  Print Sides: Double sided …                │
├─────────────────────────────────────────────────────────┤
│  Terms & Conditions       │  Subtotal (Exclusive) R … │
│  1. Payment due …         │  Delivery             R … │
│  2. (proforma only) 50%   │  VAT                  R … │
│     deposit on acceptance │  Total           **R …**  │
│                           │  Amount Due      **R …**  │
├─────────────────────────────────────────────────────────┤
│  Banking Details (Bank / Account / Number / Branch /     │
│                   Reference = invoice number)            │
├─────────────────────────────────────────────────────────┤
│  Acceptance of Invoice (proforma only)                   │
│  Name [_____]   Signature [_____]                        │
├─────────────────────────────────────────────────────────┤
│  Disclaimer / legal footer (small grey text)             │
│                                          Page 1 of N     │
└─────────────────────────────────────────────────────────┘
```

## Implementation

Rewrite `supabase/functions/generate-invoice-pdf/index.ts` by porting the helpers and section builders from `quote-pdf/index.ts`:

1. Drop the red `HEADER_H = 70` banner and the centred `BANKING DETAILS` card. Adopt the bordered-box header with logo + document title + number on the right.
2. Reuse the **font-loading** block (Noto Sans via `@fontsource` CDN with Helvetica fallback) and the `fontkit` registration so the look matches the quote exactly.
3. Reuse the **resolveFromParty** pattern (branch → tenant fallback) for the Invoice From box, including banking and address-line resolution. Source data already on `tenant` + `branch` passed in.
4. Reuse the **labelChip / strokeBox / wrapText / drawText** helpers verbatim — keep them inline in this file (no shared module) to avoid disturbing other functions.
5. Build the **6-column metadata strip**: `Account No. | VAT Reg No. | Invoice Date | Order Number | Representative | Invoice Number`. Representative resolves from `order.created_by` profile (same query pattern as quote).
6. Build the **7-column items table** with the same column widths as the quote: Item Code, Description, Qty, Unit Price, Disc %, VAT %, Line Total. Item rows reuse `buildSpecs()` to render the two-column spec breakdown (Size / Binding / Pages / Print Sides / Print Colour) underneath the description — driven by `order_jobs.configuration.selected_options`, `page_count`, `is_color`, `is_duplex` (identical logic to quote).
7. **Totals block** moves into the right column of a two-column footer, paired with **Terms & Conditions** on the left. Terms text comes from `tenant_settings.documents.invoice_terms` (new optional key — falls back to a sensible default; no migration required because `resolve_tenant_setting` already returns null for unknown keys). For `kind === "proforma"` the default terms include the "50% deposit on acceptance" line that PostNet uses; for `kind === "invoice"` the default is the standard "Payment due within X days" line, where X comes from `financial.payment_terms_days` if present.
8. **Banking block** stays but is restyled as a left-aligned box with `Reference: <invoice number>`, matching the quote.
9. **Acceptance of Invoice** (Name / Signature lines) renders only for `kind === "proforma"`, mirroring the quote's Acceptance section.
10. **Disclaimer** (`docs.legal_footer_text` or default exchange-rate paragraph) renders as small grey text at the bottom, with `Page X of N` on the right.
11. Keep all existing function signature, storage path, `order_invoices` insert, and CORS behaviour identical so callers (`AdminOrderDetail`, cart submit, etc.) need no changes.

## Verification

- Generate a proforma for an order with multiple jobs + delivery → confirm boxed PostNet-style layout, 7-column table, spec breakdown, "Acceptance of Invoice" block, and banking reference = invoice number.
- Generate a tax invoice for a paid order → confirm title flips to "TAX INVOICE", Acceptance block hides, Amount Due reflects `amount_paid`.
- Confirm multi-page orders paginate the items table with the header repeating, footer reserve preserved (port `FOOTER_RESERVE` constant).
- Compare side-by-side with `Quote-Q-00002.pdf` to confirm visual parity.

## Out of scope

- No changes to `quote-pdf`, `send-quote-email`, `AdminQuoteDetail`, or any UI surface.
- No DB migrations. The optional `invoice_terms` setting reads via the existing `tenant_settings` JSONB path; admins can populate it later from Admin → Settings → Documents (existing tab).
