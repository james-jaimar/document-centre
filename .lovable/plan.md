I found two concrete regressions causing what you’re seeing:

1. The Bound Documents orientation check is looking for the wrong slug: it checks `"n"`, but the real product family slug is `"bound-documents"`. That is why landscape uploads are not triggering the orientation advisory.
2. The preview still uses `bindingEdge="top"` as the signal for landscape short-edge binding. After removing long-edge/top binding, that naming is now misleading and is causing the binding spine logic to behave like a top-bound mode even though we want a normal left-side short-edge binding.

Plan:

1. Fix the orientation advisory trigger in `OrderFiles.tsx`
   - Replace the hardcoded `familySlug === "n"` condition with a proper portrait-enforced family set, including at least:
     - `bound-documents`
     - `ring-binders`
     - `booklets` if the product is meant to enforce portrait pages
   - Keep `presentations` as the landscape-enforced family.
   - Ensure the advisory waits for the actual product family slug before deciding, so it cannot silently skip the check.

2. Fix rotation handling after the user accepts the advisory
   - After calling the backend `rotate` job, re-inspect or re-read the asset dimensions and persist the swapped `page_width_mm` / `page_height_mm` values.
   - Render thumbnails from the rotated asset using each page’s own MediaBox (`box = null`) so mixed-orientation documents are still not globally cropped.
   - Preserve existing `preflight_data` and mark `orientation_resolved: true` only after the rotate/render flow succeeds.

3. Restore clean short-edge preview semantics
   - Stop using `bindingEdge="top"` to mean “landscape short-edge binding”.
   - Rename/replace the preview signal with something explicit, e.g. `bindingArtEdge: "long" | "short"`, while keeping the layout as a normal side-by-side left-bound flipbook.
   - Bound Documents after rotation should normally resolve to `long` portrait spine art.
   - Presentations / any allowed landscape short-edge product should resolve to `short` art, still positioned on the left side.

4. Fix the preview aspect ratio after orientation enforcement
   - `PreviewPanel` currently derives page aspect ratio from uploaded document dimensions. Once a landscape bound-document file is rotated, it must use the updated portrait dimensions so the preview becomes portrait and the binding sits correctly.
   - Avoid any leftover top-bound/rotated-layout code paths in `FlipBook`.

5. Verify mixed-orientation handling stays intact
   - Keep thumbnail rendering with `box = null` for normal full-document renders.
   - Do not reintroduce automatic server-side `normalizeOrientation` during upload.
   - The only full-document rotation should be the explicit customer action from the advisory dialog.

Technical files to update:
- `src/pages/dashboard/OrderFiles.tsx`
- `src/pages/dashboard/OrderBuild.tsx`
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/DocumentPreview.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/BindingSpine.tsx`
- `src/components/preview/previewTypes.ts`

Expected result:
- Uploading `18pp A4 Landscape.pdf` into Bound Documents triggers the “Landscape Document Detected” warning.
- Choosing rotate produces a portrait document for Bound Documents.
- The Step 2 preview shows a normal portrait bound document, not a landscape/top-bound preview.
- Presentations remain landscape-enforced.
- Mixed-orientation rendering remains protected from global crop/guillotine behaviour.