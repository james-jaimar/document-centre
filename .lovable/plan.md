

# Fix FlipBook UX: Spread Navigation, B&W Rendering, Edge Cases

## Problems

1. **Navigation advances one page instead of one spread** — The PreviewPanel arrows increment `currentPage` by 1, but in a bound book with `showCover: true`, react-pageflip treats pages in pairs (spreads). Pressing "next" should flip to the next spread (advance by 2), not show a half-turn.

2. **First/Last buttons break** — Jumping to page 0 or the last page index causes weird flipping because react-pageflip doesn't handle arbitrary `flip()` calls well when multiple spreads need to be skipped.

3. **B&W pages show in colour** — `FlipPage` supports an `isColor` prop with a `grayscale(100%)` CSS filter, but the data never flows there. The `pages` array in `PreviewPanel` has `isColor` per page, but only `thumbnailPaths` (strings) are passed down through `DocumentPreview` → `FlipBook`. The color flags are lost.

4. **Page counter says "Page 3 of 24" but two pages are visible** — Should show which spread is open (e.g., "Pages 4–5 of 24").

## Solution

### 1. Pass per-page colour flags through the component chain

- **`PreviewPanel`**: Build a `colorFlags: boolean[]` array alongside `thumbnailPaths` from `pages[].isColor`. Pass it to `DocumentPreview`.
- **`DocumentPreview`**: Accept `colorFlags?: boolean[]` and pass through to `FlipBook`.
- **`FlipBook`**: Accept `colorFlags?: boolean[]`. Pass `isColor={colorFlags?.[i] ?? true}` to each `FlipPage`.

### 2. Fix navigation to work in spreads for bound documents

- **`PreviewPanel`**: Detect if `productType` is a bound type. If so:
  - Single arrows advance by 2 (one spread flip)
  - Double arrows go to page 0 / last page
  - The slider still works page-by-page but snaps to even indices (spread boundaries)
  - Page info shows "Pages 4–5 of 24" when a spread is open, "Page 1 of 24" for the cover

- **`FlipBook`**: The `onPageChange` callback should report the react-pageflip page index directly. The `currentPage` sync via `useEffect` should use `turnToPage()` instead of `flip()` for large jumps (first/last), as `flip()` only animates one page turn.

### 3. Fix page info display

- When bound: show "Pages X–Y of N" for spreads, "Page 1 of N" for the cover
- B&W/Colour label should reflect the *currently visible* page(s), not just `currentPage`

## Files to edit

1. **`src/components/preview/previewTypes.ts`** — Add `colorFlags?: boolean[]` to `FlipBookProps` and `PreviewComponentProps`
2. **`src/components/preview/FlipBook.tsx`** — Use `colorFlags` per page; fix `currentPage` sync to use `turnToPage` for jumps; report spread-aware page index
3. **`src/components/preview/DocumentPreview.tsx`** — Accept and pass `colorFlags`
4. **`src/components/order/PreviewPanel.tsx`** — Build `colorFlags` array; spread-aware navigation (±2 for bound types); update page info text to show spread range and correct colour status

