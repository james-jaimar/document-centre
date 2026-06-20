## Business Cards — fixes for Step 1 labels, duplex toggle, and Document Size

### 1. Section badges should read "Front" / "Back" (not "Front Cover" / "Back Cover")
File: `src/components/order/SectionList.tsx`

Add a `BUSINESS_CARD_LABELS` map and wire it up in `getLabels`:
```ts
const BUSINESS_CARD_LABELS: Record<string, string> = {
  front_cover: "Front",
  back_cover: "Back",
  body: "Body",
  insert: "Insert",
  tab: "Tab Divider",
};
// in getLabels:
if (familySlug === "business_cards" || familySlug === "business-cards") return BUSINESS_CARD_LABELS;
```

### 2. Hide the Duplex/Simplex toggle on business cards
Same file. The customer can't pick simplex/duplex independently of how many faces (Front / Back) they uploaded — sides are determined by the section roster.

```ts
const HIDE_DUPLEX = new Set(["brochures", "posters", "business_cards", "business-cards"]);
```
The colour toggle stays per section (they explicitly want Colour ↔ Mono settable independently for Front and Back).

Downstream: the `business_cards` branch in `calculatePrice.ts` already chooses the `Print Sides` axis (`single` vs `double`) from how many printable sections exist, not from a section's `is_duplex` flag, so nothing else needs to change for pricing.

### 3. Document Size dropdown on Step 2 missing the new sizes
The "Document Size" option is populated from `product_catalog_links` for the Business Cards family (see `useCatalogBackedOptions.ts` lines 209-222). It currently only resolves to `90×50 mm` because that's the only size linked to the family in the master catalogue.

The newly-added sizes (`90×55 mm`, `85×55 mm`) exist in `catalog_sizes` but have **not been linked** to the Business Cards family yet.

**Action (data, not code):** In Platform → Products → Business Cards → Catalogue tab, tick the two new sizes so they appear as links. The dropdown will then show all three, and the auto-size-match effect in `OrderBuild.tsx` (lines 438-498) will pre-select `90×55 mm` automatically when it matches the uploaded PDF's trim box within the 3 mm tolerance.

No code change is required for #3 — but I'll add a brief note in the plan execution to confirm the link rows exist after you tick them, and verify the auto-match fires on the Talking Dog PDF.

### Verification
1. Upload the `Ady Bus Card` PDF → Step 1 shows badges **Front** and **Back** (no "Cover" suffix), each with a **Colour** chip but **no** Simplex/Duplex chip.
2. Continue to Step 2 → **Document Size** dropdown lists `90×50`, `90×55`, `85×55`, with `90×55 mm` pre-selected (matching the detected trim).
3. Price still resolves from `rate_card_business_cards` (250 / Double / 350gsm Matt → R250 in current data).