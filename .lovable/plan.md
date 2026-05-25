# Redesign Quote PDF to Match PostNet Layout

Use the attached `QTE382.pdf` (PostNet Groenkloof) as the visual template for our branded quote. The current PDF will be rewritten so the structure, framing and field layout match it closely while still pulling data from our schema (branch/tenant identity, customer, items, banking).

## Layout

```text
┌──────────────────────────┐                  ┌──────────────┐
│ Quote From:              │                  │   [LOGO]     │
│ <Branch trading name>    │                  └──────────────┘
│ <Address line 1>         │                       QUOTE
│ <Address line 2..>       │
│ Tel:  <phone>            │
│ Fax:  <fax>              │
│ EMail: <branch email>    │
└──────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────┐
│ Quote To:                │  │ Deliver To:              │
│ <Customer name/company>  │  │ <Delivery name>          │
│ <Billing address>        │  │ <Delivery address>       │
│ Tel: …  Fax: …           │  │                          │
│ Customer VAT No.: …      │  │                          │
└──────────────────────────┘  └──────────────────────────┘

[Account No │ VAT Reg No │ Quote Date │ Order Number │ Representative │ Quote Number │ Page]
[ values…                                                                                  ]

[Item Code │ Description │ Qty │ Unit Price │ Disc % │ VAT % │ Line Total]
… line items, multi-line descriptions supported …

Terms and Conditions                              Subtotal (Exclusive)   X.XX
1. …                                              VAT                    X.XX
2. …                                              Total                  X.XX

Banking Details (if branch has EFT enabled)
  Bank · Account Name · Account No · Branch Code · SWIFT · Instructions

Acceptance of Quote
  Name      _______________________
  Signature _______________________

Please note: <long disclaimer>

[barcode]                                            Created: <timestamp>
```

## Data mapping

| PDF field | Source |
|---|---|
| Quote From block | Branch identity (trading name, address, tel, fax, email) → tenant fallback |
| Logo (top-right) | `tenants.settings.branding.logo_url` (existing behaviour, moved) |
| Quote To | `quotes` customer fields (name, billing address, phone, fax, VAT) |
| Deliver To | Delivery address on quote/order; falls back to "Same as billing" or blank |
| Account No | Customer account number if present, else blank |
| VAT Reg No | Branch VAT number → tenant VAT (the seller's VAT, like PostNet) |
| Quote Date | `quotes.created_at` (dd/mm/yyyy) |
| Order Number | Linked order number if quote is tied to an order, else blank |
| Representative | Quote owner display name (`profiles.display_name` of `created_by`), else blank |
| Quote Number | `quotes.quote_number` |
| Page | "N of M" |
| Item rows | `quote_items.{sku/product_code, description, notes, quantity, unit_price, discount_pct, vat_pct, line_total}` — blanks rendered for missing optional fields |
| Subtotal/VAT/Total | Existing totals on `quotes` |
| Banking | `branches.banking_details` (branch-wins, tenant fallback) — only when EFT enabled |
| Disclaimer | Tenant setting `quotes.pdf_disclaimer` (with PostNet-style default) |
| Created | `now()` server time |

## Implementation

Rewrite `supabase/functions/quote-pdf/index.ts` rendering only (keep the existing handler, identity resolution, stream/JSON dual mode and banking lookup as-is):

1. Replace the current header/From/Bill To/items/totals/banking drawing code with the new layout above.
2. Add bordered boxes (`drawRectangle` with light border) for **Quote From**, **Quote To**, **Deliver To**, and the **metadata strip** header row.
3. Use a soft tint (existing `brandSoft`) for the section-title chips ("Quote From:", "Quote To:", "Deliver To:", "Acceptance of Quote", "Terms and Conditions", table header).
4. Items table: 7 columns sized for A4 portrait, description column wraps and supports a second muted line for `notes`.
5. Right-aligned totals block bottom-right; left column holds Terms → Banking → Acceptance.
6. Multi-page support already exists — extend pagination so the totals/acceptance/footer block always lands on the final page, and the table header repeats on continuation pages.
7. Long "Please note" disclaimer rendered above the bottom edge on the last page.
8. "Created: <dd/mm/yyyy HH:MM:SS>" bottom-right footer. Drop the small per-page footer with company info (now in the From box).

## Out of scope
- No schema changes. If `discount_pct`, `vat_pct`, `sku`, `notes`, `fax`, `account_number`, or `delivery_address` aren't present on a quote, the cell renders blank.
- No barcode (PostNet-specific identifier system); leave blank or render the quote number as a small text token bottom-left.
- No change to `send-quote-email`, the stream-mode privacy work, RLS, or the branch identity/banking UI.
