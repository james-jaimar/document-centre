
# Pricing & VAT fixes (INV-00115 root-causes)

Two independent bugs found by inspecting the actual job + order row for INV-00115. Both have a clear fix path.

---

## Part 1 — Duplex clicks doubled for flyers

### What's happening

The order job for INV-00115 has this `configuration.raw_spec`:

```text
is_duplex: true
page_count: 4         ← wrong, the uploaded PDF is 2 pages
selected_options: {...}
sections: (not present on raw_spec)
merge_directives:
  - front_cover, page_count: 2  (asset is the 2-page flyer file)
  - back_cover,  page_count: 2  (same file)
```

`src/lib/calculatePrice.ts` (lines 645-697) does the right thing:
- If `spec.sections` is set → one click line per section.
- Else → one virtual section with `page_count = spec.page_count, is_duplex`.

With `page_count: 4, is_duplex: true` and no `sections`, the engine computes `ceil(4/2) = 2 clicks` per piece. At R8.50 duplex × 2 + paper ≈ R17.60. That matches the wrong unit price exactly.

The real document is **1 sheet, duplex = 1 click per piece**. Expected unit ≈ R8.50 + paper ≈ R9.10, line ≈ R91.

### Where the wrong number is born

The flyer is being modelled in the cart as **two separate sections** (`front_cover` + `back_cover`), each pointing at the *same* 2-page PDF, each carrying `page_count: 2`. Then the spec rollup adds them: 2 + 2 = 4 pages duplex. For a single-sheet flyer the model should be **one section** with `page_count: 2, is_duplex: true` (or `pageRoles` ["front_cover","back_cover"] inside one section).

### Fix

1. **Authoritative fix at the price engine** (`src/lib/calculatePrice.ts`):
   - When `spec.sections` is absent, also accept `spec.merge_directives` to build the section list. For each directive, derive section page count from `page_range_end − page_range_start + 1` (the actual range used), not the source document's whole `page_count`. This eliminates the doubling regardless of how the cart shaped the spec.
   - Add a defensive cap: when no sections/directives are given and `page_count` exceeds the largest source document's page count, fall back to that document's count.

2. **Root cause at snapshot build** (`src/lib/orders/buildJobSnapshot.ts` + the cart spec writer):
   - For loose-sheet products (flyers, posters, photo prints), do not emit `front_cover` + `back_cover` as two sections when both reference the same document. Collapse to a single section spanning the whole file with `is_duplex` derived from "Print Sides".
   - When two cover sections legitimately exist but each carries the whole-document `page_count`, use `page_range_end − page_range_start + 1` for the per-section count, not `documents[i].page_count`.

3. **Audit script** (one-off, no UI): a `scripts/audit-pricing.ts` that re-runs `calculatePrice` against every active product family with a representative spec and logs:
   - duplex click count per piece,
   - paper sheet count,
   - per-unit total
   so I can verify no other family is double-billing before we sell this.

### Verification

- Manually re-quote the INV-00115 spec: expect 1 click/piece, R≈9.10 unit, R≈91 line.
- Re-quote a 4-page A4 booklet (saddle-stitch): expect 2 clicks/piece (sheets 1+2 duplex).
- Re-quote a 1-page A4 flyer simplex: expect 1 click/piece.
- Run the audit script across all families; review the printed table for any unit > sane bounds.

---

## Part 2 — VAT computed and shown

### What's happening

`orders.vat_amount = 0` and `total = subtotal = 176`, but the tenant's `financial` settings have `tax_enabled: true, tax_rate: 15, tax_inclusive: false`. The invoice PDF shows `VAT %: 15.00%` on the line but `VAT: R0.00` and Total = Subtotal — because the orders row never gets its `vat_amount` populated.

The cause is in `supabase/functions/order-engine/index.ts` → `syncOrderTotals` (lines 1570-1590). It reads the existing `vat_amount` straight from the row and never recomputes it from tenant tax config. Nothing else writes to `vat_amount` for normal orders. The helper `computeVat` in `src/lib/tax/resolveBranchTax.ts` already does the right maths but is only used in client previews.

### Fix

1. **Compute VAT inside `syncOrderTotals`**:
   - Load tenant + branch `financial` settings (`tax_enabled`, `tax_rate`, `tax_inclusive`) via the same merge rule as `resolveBranchTax.ts`. Branch overrides tenant.
   - After computing `subtotal = jobsTotal + adjTotal`, compute `taxableBase = subtotal − discount_amount + delivery_amount`.
   - **Exclusive mode**: `vat_amount = round(taxableBase × rate/100, 2)`; `total = taxableBase + vat_amount`.
   - **Inclusive mode**: `vat_amount = round(taxableBase − taxableBase/(1+rate/100), 2)`; `total = taxableBase` (VAT already inside).
   - Persist `vat_amount` on the orders row alongside `subtotal`/`total_amount`/`amount_due`.
   - Skip recompute if `tax_enabled = false` (leave vat_amount = 0).

2. **Stop overriding VAT manually in `updateOrderTotals` (line 1355)** unless the caller is explicitly setting a manual override. Add a `vat_override` boolean column path (or accept it as a metadata flag) so admin-typed VAT isn't wiped by the next `syncOrderTotals`. For now, the simple rule: tenant-tax-enabled tenants always get auto-VAT; tenants with `tax_enabled = false` keep the manual value.

3. **Invoice PDF** (`supabase/functions/generate-invoice-pdf/index.ts`):
   - When exclusive: render `Subtotal (Excl.)`, `VAT (15%)`, `Total`, `Amount Due` — VAT row must show the computed amount, not zero.
   - When inclusive: render `Subtotal (Incl.)`, `VAT included (15%)`, `Total`, `Amount Due` — the VAT row shows the embedded portion.
   - Pull the VAT % label from the line `vat_rate` already stored on `order_jobs`.

4. **Backfill INV-00115** with a one-off SQL after the engine fix is deployed: call `syncOrderTotals` (via a tiny admin RPC or a re-save no-op) so its `vat_amount` repopulates.

### Verification

- Reload INV-00115 after backfill: expect `subtotal 176`, `vat 26.40`, `total 202.40`, `amount_due 202.40` (assuming the pricing fix hasn't been retroactively applied to this order's jobs — keep them independent).
- Place a fresh test order with `tax_inclusive = false`: line totals exclusive, VAT row populated, total = subtotal × 1.15.
- Flip the tenant to `tax_inclusive = true`, place another: line totals already include VAT, VAT row shows the embedded portion, total = subtotal.
- Re-open the proforma PDF — VAT row matches the orders row, no more "Total = Subtotal" with zero VAT.

---

## Files I'll touch

- `src/lib/calculatePrice.ts` — accept merge_directives, use page-range sizing, defensive cap.
- `src/lib/orders/buildJobSnapshot.ts` (+ wherever the cart writes the flyer spec) — collapse same-doc covers, use range sizing.
- `supabase/functions/order-engine/index.ts` — VAT compute inside `syncOrderTotals`, guard `updateOrderTotals` override.
- `supabase/functions/generate-invoice-pdf/index.ts` — render VAT row correctly for both modes.
- `scripts/audit-pricing.ts` — new, one-off cross-family sanity check.

No schema migrations required (vat_amount column already exists).
