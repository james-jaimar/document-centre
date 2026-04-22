

## Fix ring binder preview: correct page sizing, positioning, and no-cover behaviour

### What is wrong

Three specific bugs in the ring binder branch of `FlipBook.tsx`:

1. **Pages are the wrong size** — `flipPageW` and `flipPageH` are derived from the artwork content area dimensions, not from the document's actual aspect ratio (`BASE_PAGE_WIDTH` / `basePageHeight`). This makes A4 pages appear as squashed rectangles that fill the binder artwork rather than maintaining their real proportions.

2. **Pages do not start on the right-hand side** — when no cover exists, `showCover={hasRealFrontCover}` is `false`, so `react-pageflip` pairs pages as `[0,1], [2,3]` instead of placing page 0 solo on the right. The first page should always appear solo on the right side of the open binder.

3. **No cover still shows closed binder** — `startPage={hasRealFrontCover ? 1 : 0}` tries to skip past the cover but the logic is inverted. When "No Cover" is selected, the preview should go straight to the open binder view with no closed-front state at all.

### Fix

All changes are in `src/components/preview/FlipBook.tsx`, ring binder branch (lines 324–528).

#### A) Use the standard fixed-resolution approach for page dimensions
Replace the current artwork-derived page sizing:
```
const flipPageW = Math.round(contentW / 2);
const flipPageH = Math.round(contentH);
```
with the same `BASE_PAGE_WIDTH` / `basePageHeight` approach used by wire-bound:
```
const flipPageW = basePageWidth;    // 400
const flipPageH = basePageHeight;   // ~566 for A4
```
Then CSS-scale the `HTMLFlipBook` stage to fit within the artwork's content area, just like the standard path scales to fit the available container.

#### B) Always use `showCover={true}` so page 0 is solo on the right
Change the `HTMLFlipBook` prop from `showCover={hasRealFrontCover}` to `showCover={true}`. This ensures the first page always renders solo on the right-hand side of the spread, matching wire-bound behaviour.

Set `startPage={0}` always (remove the conditional).

#### C) Skip the closed binder state entirely when no cover exists
The `showClosedCover` guard already handles this (`hasRealFrontCover && currentPage === 0`), but the `isShowingFrontCover` logic in the open state also needs to account for the solo first page. When there is no real cover, page 0 is still a solo page visually (right-side only) — it just shows the open binder background instead of the closed one.

#### D) Scale the flipbook stage into the artwork content area
Compute a `ringScale` factor:
```
const ringScaleX = contentW / (basePageWidth * 2);
const ringScaleY = contentH / basePageHeight;
const ringScale = Math.min(ringScaleX, ringScaleY, 1);
```
Apply `transform: scale(ringScale)` with `transformOrigin: top left` to the flipbook wrapper div, and centre it within the content area. This keeps pages at correct A4 proportions while fitting inside the binder artwork.

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Ring binder branch: use `BASE_PAGE_WIDTH`/`basePageHeight` for flipbook, CSS-scale into artwork content area, always `showCover={true}`, `startPage={0}`, fix solo-page detection for no-cover case |

### Result

- **No cover selected**: straight to open binder view, no closed-front state
- **First page**: always solo on the right-hand side
- **Page proportions**: correct A4 ratio maintained, scaled to fit the binder artwork

