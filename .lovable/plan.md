## Goal
Pack pricing (flyers etc.) currently ignores spec. Extend the ladder so each row is keyed by **size + paper + sides + qty**, matching how print shops actually quote flyers (e.g. A5 / 170gsm silk / double-sided / 500 = R X).

## 1. Data model
Keep block pricing on `product_families.quantity_blocks` (no new table) but change the row shape:

```ts
type QuantityBlock = {
  size: string;        // canonical size label, e.g. "A5", "DL"
  paper: string;       // paper item_code from catalog_papers, e.g. "gloss_170"
  sides: "single" | "double";
  qty: number;
  price_minor: number;
  cost_minor?: number;
};
```

- Migration: no schema change (already `jsonb`); add a lightweight validation trigger to reject rows missing `size/paper/sides`.
- One-time data migration: existing rows (which only have qty/price) are re-keyed as `size = <family default>`, `paper = <family default>`, `sides = "single"` so nothing breaks.

## 2. Admin editor (`ProductFamilyForm.tsx`)
Replace the flat block list with a **matrix editor**:

```text
Size:  [A6] [A5] [A4] [DL]           ← tab strip
Paper: [130gsm gloss ▼]              ← select (populated from catalog_papers enabled for this family)

              Single-sided   Double-sided
     50       R___  cost__   R___  cost__
    100       R___  cost__   R___  cost__
    250       R___  cost__   R___  cost__
    ...
[+ add qty row]   [+ add size]   [+ add paper]
```

- "Qty ladder" (50/100/250/…) is shared across the whole family — edited once, applied to every size/paper/sides cell.
- Empty cells = "not offered" (customer can't pick that combo).
- Bulk actions: "copy A5 prices → A4", "double = single × 1.6", "clear paper".

## 3. Customer flow
`useOrderBuilder` + `PriceSummary`:
1. When `quantity_mode === "blocks"`, resolve `activeBlock` by filtering `quantity_blocks` where `size === spec.size && paper === spec.paper && sides === spec.sides`, then matching `qty`.
2. Quantity dropdown shows only qtys available for the current size/paper/sides combo.
3. Changing size/paper/sides re-filters the ladder and snaps qty to the nearest available block (with a toast if the previous qty isn't offered).
4. If no blocks match the combo → show "This combination isn't available — pick a different paper/size" and disable Add to Cart.
5. Cart snapshot stores `{size, paper, sides, qty, price_minor}` so historical pricing is preserved.

## 4. Rate-card fallback
Not needed for block-mode families — block price is authoritative. Non-block families are unchanged.

## 5. Out of scope
- Tenant/branch overrides of the block matrix (follow-up).
- Finishing uplifts on top of the block price (follow-up; currently baked into the pack price).

## Technical notes
- Files: `src/hooks/useProductFamilies.ts` (extend `QuantityBlock` type), `src/components/admin/ProductFamilyForm.tsx` (new matrix editor component), `src/components/order/PriceSummary.tsx` + `src/pages/dashboard/OrderBuild.tsx` (spec-aware block resolution), one migration for the validation trigger + data backfill.
- Sizes/papers pulled from the existing `resolve_product_options` RPC so the matrix only offers combos the family actually supports.
