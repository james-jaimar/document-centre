# VAT / Tax model — align system to "ex-VAT internally, incl-VAT to customers"

## Principle (locked in)

- **All prices stored and edited in the system are ex-VAT.** Rate cards, pack pricing, product overrides, cost inputs, quote unit prices, order line-item prices — every number in the database is the net (ex-VAT) figure.
- **Customer-facing prices are shown incl-VAT.** Product cards, configurator PriceSummary, cart line items, quote view, checkout, invoice — the number the customer sees is `net × (1 + rate)`.
- **VAT is a display + totals concern**, computed from the resolved branch tax config (`resolveBranchTax` / `computeVat`). The engine (`calculatePrice.ts`, `useItemPricing`) does not change.
- **Totals blocks** (cart, checkout, quote, invoice, order confirmation) always show three lines: `Subtotal (ex VAT)`, `VAT @ 15%`, `Total (incl VAT)`. If VAT is disabled for the branch, the VAT line is hidden and Total == Subtotal.

## Scope of changes

### 1. Admin / branch surfaces — label as ex-VAT, no maths change
Add a small, consistent "ex VAT" suffix/hint (helper text under headings + column-header suffixes) on:
- `src/components/pricing/MasterCatalogPricingEditor.tsx`
- `src/components/pricing/RateCardEditor.tsx`
- `src/components/pricing/PackPricingMatrixEditor.tsx`
- `src/components/pricing/BranchPackPricingEditor.tsx`
- Product override editors under `src/components/products/**` that expose price fields
- `src/components/quotes/QuoteSpecBuilder.tsx` — unit price + total line clearly marked "ex VAT" with an incl-VAT hint below (informational only)
- `src/pages/admin/settings/FinancialTab.tsx` + `src/components/branch/BranchTaxCard.tsx` — reword help copy to state the model explicitly ("All prices in the system are ex VAT. VAT is added on top when shown to customers and on quotes/invoices.")

No pricing maths touched here — labels + copy only.

### 2. Shared display helper (new)
`src/lib/tax/displayPrice.ts`
- `usePriceDisplay(branchId)` hook — memoised `ResolvedTax` for the active branch (via `useTenantContext`), returns `{ tax, toGross(net), formatGross(net), formatNet(net), vatOn(net) }`.
- Removes duplicated `resolveBranchTax` calls; single source for gross conversion.

### 3. Customer-facing storefront — convert display to incl-VAT
Change **display only** (values passed in remain ex-VAT from the engine):
- `src/components/order/PriceSummary.tsx` — render unit price and running total via `toGross`; append "incl VAT" suffix when VAT enabled, "ex VAT" when disabled.
- `src/components/order/OptionSelector.tsx` — price-impact chips converted to gross with same suffix.
- Product cards / catalogue listings under `src/components/storefront/**` and `src/pages/storefront/**` — same conversion.
- `src/pages/dashboard/OrderBuild.tsx`, `PhotoPrintsBuilder.tsx` — any price readouts converted.

### 4. Totals blocks — add VAT breakdown line
`src/components/order/PriceTotals.tsx` (new shared component: Subtotal / VAT / Total, hides VAT when disabled) used by:
- `src/pages/dashboard/Cart.tsx` (replaces the single "Total" block; loops items to get ex-VAT subtotal, then applies branch VAT).
- `src/pages/dashboard/Checkout.tsx` (already stores `subtotal + vat + total` on the order via `useCart` — wire the existing values into the new block; remove the "Demo mode: no VAT" comment).
- `src/pages/dashboard/OrderConfirmation.tsx`, `CustomerOrderDetail.tsx`, `CustomerQuoteDetail.tsx`.
- Customer quote view + branch quote detail (`BranchQuoteDetail.tsx`) — quote line items shown ex-VAT with the same 3-line totals block.
- Invoice/proforma templates (if rendered client-side) — same block.

### 5. `useCart.ts`
Already computes VAT correctly for order persistence. Confirm `tax_inclusive=false` path (net stored, VAT added) is the only path used; the `inclusive` branch stays for tenants who explicitly opt in but is not the default. No behavioural change expected — just verify subtotal/vat/total fields on `orders` line up with the new display blocks.

### 6. Defaults & copy
- Tenant `FinancialTab.tsx` default: `tax_inclusive = false` (already the default), VAT rate 15%, label "VAT". Add a locked-in help panel describing the model.
- Branch `BranchTaxCard.tsx`: keep override capability but surface the tenant policy prominently so branch owners understand they're editing ex-VAT numbers.

## Out of scope
- No changes to `calculatePrice.ts`, `useItemPricing`, rate-card resolution, or any pricing maths.
- No schema migrations — `tax_*` settings already exist; no new columns.
- No change to how orders/quotes are persisted beyond confirming existing subtotal/vat/total fields render in the new totals block.

## Technical notes
- Rounding: VAT rounded to 2dp per line for display; totals summed from ex-VAT lines then VAT applied to the sum (matches `useCart.ts` today) to avoid per-line rounding drift.
- Currency formatting continues via `formatPrice`.
- Suffix strings are constants in `src/lib/tax/displayPrice.ts` so we can localise later.

## Verification
- Configurator for A5 flyer at a VAT-enabled branch: unit and total display gross; cart shows Subtotal (net) / VAT / Total; numbers reconcile.
- Same product at a branch with VAT disabled: no suffix, no VAT line, Total == Subtotal.
- Admin rate-card editor for the same branch: values match what's stored (ex-VAT), with "ex VAT" hint.
- Quote builder: unit price entered/derived ex-VAT, customer-facing quote PDF/view shows incl-VAT with VAT line.
