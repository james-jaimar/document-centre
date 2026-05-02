
# Fix: Flyer Auto-Assign Bug + Revert Fold Preview CORS Regression

## Investigation findings

### Folded leaflet regression — what actually happened

The **original** `sliceImageIntoPanels` in `FoldPreview.tsx` (commit `3ca71ff6`) used `img.crossOrigin = "anonymous"`. This is the correct approach and worked on `document-centre.com` because the S3 bucket has CORS configured for that origin.

The "fix" (commit `6837e3b0`) replaced this with a `fetch()` + blob approach. When `fetch()` fails CORS (e.g. on the Lovable preview domain), the fallback loads the image **without** `crossOrigin`. This silently taints the canvas, and then `canvas.toDataURL()` throws `SecurityError: Tainted canvases may not be exported`.

The original code would either succeed (with CORS) or fail cleanly with "Failed to load surface image". The "fix" made it worse by introducing the tainted canvas path.

**Solution:** Revert `sliceImageIntoPanels` back to the original `crossOrigin = "anonymous"` approach. This restores correct behavior on `document-centre.com`.

The same `crossOrigin = "anonymous"` pattern is already used in `composePanelImages` (`thumbnailUtils.ts` line 289) and works fine on production.

### Flyer auto-assign bug — missing `page_range_end`

In `OrderFiles.tsx`, `handleAutoAssignFlyer` creates two sections with `page_range_start` but no `page_range_end`. Without `page_range_end`, each section shows ALL pages of the document instead of just the one assigned page. That's why both Front and Back show "2 pages".

**Solution:** Add `page_range_end: 0` for the front section and `page_range_end: 1` for the back section, so each section shows exactly one page.

---

## Changes

### 1. `src/components/preview/FoldPreview.tsx`
Revert `sliceImageIntoPanels` to the original synchronous version with `img.crossOrigin = "anonymous"`. Remove the `fetch()` / blob / `async` wrapper.

### 2. `src/pages/dashboard/OrderFiles.tsx`
In `handleAutoAssignFlyer`:
- Front section: add `page_range_end: 0`
- Back section: add `page_range_end: 1`

Also check `handleFlyerDoubleSided` and `handleFlyerSingleSided` for the same missing `page_range_end`.
