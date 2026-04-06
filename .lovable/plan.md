

# Plan: Auto-detect Document Size + Fix Booklet Spread Preview

## Two issues

### 1. Document Size should default to the uploaded file's actual size
The uploaded PDF is A4 (210×297mm) but the "Document Size" option defaults to "A5 (A4 folded)" — the first option with `is_default: true`. The system should match the document's `page_width_mm`/`page_height_mm` against the available Document Size options and pre-select the matching one.

### 2. Booklet (saddle stitched) shows single pages instead of spreads
The FlipBook component uses `react-pageflip` with `showCover={true}`, which should display page 0 as a solo cover, then pages 1-2 as a spread, 3-4 as a spread, etc. The issue is that the booklet product type (`saddle_stitched`) IS in the `BOUND_TYPES` set, so `isBound` is true and the FlipBook should be rendering. But the screenshots show single pages — this suggests the FlipBook may not be receiving enough pages (only the single document's pages without proper sequence building), or the page sequence isn't being built correctly for this product.

Looking at the screenshots: "Page 1 of 28" and "Page 2 of 28" shown as single pages. The PreviewPanel navigation `step` is 2 for bound types, and FlipBook is mounted. The FlipBook should show spreads automatically via `react-pageflip`. The most likely cause is that the pages are being rendered but the viewport/clip logic is treating every page as solo. Need to verify the `buildPageSequence` output for this document.

Actually, looking more carefully at the screenshot — the page IS showing as a single page in the preview area (no spread visible). The `isSoloPage` logic shows front cover (page 0) as solo, which is correct. But page 1 onwards should show as spreads. The `isShowingLastSolo` check fires when `currentPage >= lastIdx` — if the slider steps by 2 but the FlipBook's `onFlip` returns the page index from the library, there could be a mismatch. But the real question is: does the FlipBook actually render with `showCover={true}` working properly?

Wait — looking at the image again (image-185.png, "Page 2 of 28"), the preview shows a single page centered with no spread partner. This means either:
- The FlipBook is not being used (loose sheets preview instead)
- Or the clip/viewport logic is treating page 1 as solo too

The product type is `saddle_stitched` which IS in BOUND_TYPES, so FlipBook should render. The issue might be that `currentPage=1` makes `isShowingLastSolo` false and `isShowingFrontCover` false, so `isSoloPage` should be false, meaning a spread should show. Unless there's an odd total page count issue.

Most likely the spread IS rendering but the navigation slider increments by 1 (not 2) due to how PreviewPanel passes the slider. Actually PreviewPanel's `step` is 2 for bound, and the slider's `step` is 1. The slider `onValueChange` sets `currentPage` directly. The FlipBook should handle this regardless — the library manages spread display internally. The page curl/flip should work.

Let me re-examine: the FlipBook component uses `usePortrait={false}` which means it renders in spread mode. With `showCover={true}`, page 0 = solo right, pages 1-2 = spread, etc. This should work. The issue might be that the document has been loaded but the `buildPageSequence` returns pages with many blank_backs (simplex mode), doubling the page count and breaking the spread layout.

Looking at the sections — the document's section has `is_duplex` that determines whether blank_backs are inserted. If the section's `is_duplex` is false (simplex), every body page gets a `blank_back`, so a 28-page PDF becomes 56 faces. Page 0 = cover, page 1 = blank_back, page 2 = page 2, page 3 = blank_back... This would make every "real" page appear solo on the right with a blank left partner.

The fix: For booklets specifically, sections should default to duplex since the pages in a saddle-stitched booklet are always printed on both sides. But more immediately, the `is_duplex` flag on the section should be checked — if it's false and the product is a booklet, we should either force duplex or not insert blank_backs.

## Changes

### `src/pages/dashboard/OrderBuild.tsx`
1. **Auto-match Document Size**: After documents load and options are initialized, compare the first document's `page_width_mm`/`page_height_mm` against the Document Size option values' metadata. If a match is found, auto-select that option instead of the default.
2. This runs once after both documents and options are available, only if the user hasn't already customized the selection.

### `src/components/order/PreviewPanel.tsx`
1. **Fix simplex blank_back injection for booklets**: In `buildPageSequence`, when the product type is a booklet/saddle-stitched, skip blank_back insertion regardless of section `is_duplex` flag. Booklets are physically duplex by nature — every sheet is printed on both sides.
2. Pass `productType` into `buildPageSequence` so it can make this decision.

## Technical details

### Document Size auto-detection
```text
For each Document Size option value:
  - Extract width_mm and height_mm from metadata
  - Compare against document.page_width_mm / page_height_mm (±3mm tolerance)
  - Check both portrait and landscape orientations
  - If match found, set selected_options["Document Size"] = matched slug
```

### Booklet duplex fix
In `buildPageSequence`, add a `productType` parameter. When productType is `saddle_stitched`, never insert `blank_back` faces — the pages should flow continuously as spreads.

## Files to change
| File | Change |
|------|--------|
| `src/pages/dashboard/OrderBuild.tsx` | Add useEffect to auto-match Document Size from document dimensions |
| `src/components/order/PreviewPanel.tsx` | Pass productType to buildPageSequence; skip blank_back for saddle_stitched |

