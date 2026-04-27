## Problem

Bound documents are portrait-oriented products, but uploading a **landscape** file does **not** prompt the user to rotate it. Only `presentations` has an orientation advisory — and it only fires in the portrait → landscape direction. There is no symmetrical landscape → portrait check for bound-document family products.

**Confirmed in `src/pages/dashboard/OrderFiles.tsx` (line 296–316):**
```ts
if (productFamily?.slug !== "presentations") return;
// portrait = width < height
return w > 0 && h > 0 && w < h;
```

So bound documents currently accept landscape uploads silently, with no rotation prompt.

## Fix

1. **`src/pages/dashboard/OrderFiles.tsx`** — Add a second `useEffect` that mirrors the existing orientation check, but inverted:
   - Triggers when `productFamily?.slug` is in the **bound-document family set** (e.g. `bound_documents`, `wire_bound`, `comb_bound`, `perfect_bound`, `saddle_stitched`, `ring_binder` — I'll confirm exact slug(s) by reading the families table / config in the implementation pass).
   - Detects pages where `w > h` (landscape) and `preflight.orientation_resolved` is not set.
   - Opens the existing `OrientationAdvisory` modal with rotated copy (Landscape → Portrait).

2. **`src/components/order/OrientationAdvisory.tsx`** — Make the dialog direction-aware via a new optional prop `mode: "to-landscape" | "to-portrait"` (default `"to-landscape"` to preserve existing behaviour). When `to-portrait`:
   - Title: "Landscape Document Detected"
   - Body: explains bound documents need portrait orientation
   - Primary action: "Rotate 90° to Portrait"
   - Secondary action: "Use Presentations Instead" (switches product family)

3. **`handleRotateToLandscape`** in `OrderFiles.tsx` — Generalise to `handleRotateOrientation` (or add a sibling). Both directions call `rotate(assetId, 90)` on the backend; the only difference is the toast copy and the `orientation_action` value written to `preflight_data`.

4. **Audit other bound-style families** — Quickly grep for any other product-family slugs that have a fixed expected orientation to ensure none are silently accepting wrongly-oriented uploads (photos, leaflets, flyers, posters were called out previously — I'll confirm whether any of those need an advisory too, and report findings before adding more dialogs).

## Files to change
- `src/pages/dashboard/OrderFiles.tsx` — add inverse orientation effect + rotate handler
- `src/components/order/OrientationAdvisory.tsx` — direction-aware copy

No schema changes. No new tables.
