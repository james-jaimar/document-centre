# Fix: Business Cards size dropdown only shows 90×50 mm

## Root cause

The three Business Card sizes all exist in `catalog_sizes` (master scope, active):

- `bc-90x50` — 90 × 50 mm
- `bc-90x55` — 90 × 55 mm  ← not linked
- `bc-85x55` — 85 × 55 mm  ← not linked

But `product_catalog_links` for the Business Cards family (`f0855bbf-…`) currently has **only one** `catalog='size'` row: `bc-90x50`. `useCatalogBackedOptions` projects the dropdown from those links, so the customer sees just `90×50 mm`. The auto-size-match in `OrderBuild.tsx` then has no `90×55 mm` candidate to pre-select against the PDF's trim box, so the field stays "Not selected".

Nothing is hard-coded — it is purely missing link rows.

## Plan

Single data-only migration that inserts master-scope `product_catalog_links` rows for the two missing sizes (idempotent — uses `ON CONFLICT DO NOTHING` against the natural key, or guarded `NOT EXISTS`):

```sql
INSERT INTO public.product_catalog_links
  (product_family_id, catalog, item_code, scope_type, sub_attribute, is_default, sort_order)
SELECT 'f0855bbf-ca0c-40df-a70f-5f286e6985d4', 'size', code, 'master', '', false, sort
FROM (VALUES ('bc-90x55', 1), ('bc-85x55', 2)) AS v(code, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_catalog_links
  WHERE product_family_id = 'f0855bbf-ca0c-40df-a70f-5f286e6985d4'
    AND catalog = 'size'
    AND scope_type = 'master'
    AND item_code = v.code
);
```

No application code changes — the rendering pipeline (`useCatalogBackedOptions` → `resolvedRowsToSizeValues`) and the auto-match in `OrderBuild.tsx` already do the right thing once the links exist.

## Verification

1. Re-open Business Cards → Step 2. Document Size dropdown lists **three** options: `90×50 mm`, `90×55 mm`, `85×55 mm`.
2. Upload the `Ady Bus Card` PDF (trim 90×55). Step 2 pre-selects `90×55 mm` automatically and the chip in the right-hand summary shows `90×55 mm`.
3. Pricing still resolves from `rate_card_business_cards` (size axis is informational; pack/sides/paper/lamination drive the price).

## Note on admin UX

This is a one-off data fix for the rows you added today. Going forward, new sizes added to the master catalogue still need to be linked to each family in **Platform → Products → Business Cards → Catalogue** before they appear to customers — that's the existing admin-driven model and is intentional. If you'd like, a separate follow-up could add a "Link all matching sizes" shortcut, but that is out of scope here.
