

## Fix ring binder: background clipping, tab space, and last-page blank

### Three issues from the screenshots

1. **Binder background clipped on all sides** — The `binderInsetXFraction` (0.08) and `binderInsetYFraction` (0.06) are too small. The binder PNG's cover edges and top/bottom rims extend further than that, so the artwork gets cropped where pages meet the frame boundary. Need to increase these insets so the full binder artwork is visible around the pages.

2. **No space for tab overlays** — The tab gutter (36px) is reserved in the sizing math but the tabs themselves render outside the page container which clips them. The outer containers need `overflow: visible` all the way up, and the tab gutter needs to be accounted for so the binder frame sits inward enough to leave room for tabs on both outer edges.

3. **Nothing on the right after the last page flip** — When you reach the last page and it lands on the left side, the right flipbook has no page to show. Need to detect this end-state and render a blank white page on the right side (the inside of the back cover, essentially).

### Changes in `src/components/preview/FlipBook.tsx`

**Constant tuning:**
- Increase `binderInsetXFraction` from `0.08` to `0.12` — gives more visible binder cover edge on left and right
- Increase `binderInsetYFraction` from `0.06` to `0.10` — gives more visible binder rim top and bottom
- These are proportional to pageWidth/pageHeight, so the binder artwork will fully surround the pages with breathing room

**Tab gutter fix:**
- Ensure tab gutter space is outside the binder frame, not eaten by it
- The container width calculation already includes `tabGutter * 2` but the pages inside need `overflow: visible` on their wrappers so tab SVGs (which extend ~30px beyond the page edge) actually render visibly
- Verify the left/right flipbook wrapper divs have `overflow: visible` (they already do, but confirm the parent chain does too)

**Last-page blank:**
- After computing `rightIndex = currentPage`, check if `rightIndex >= urls.length`
- When true, instead of trying to show a non-existent page in the right flipbook, render a plain white rectangle (same dimensions as `pageWidth x pageHeight`) in the right slot — this represents the inside of the back binder cover
- The right `HTMLFlipBook` is hidden in this state; a simple `<div>` with white background replaces it

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Increase binder inset constants; add blank-right-page fallback when `rightIndex >= urls.length`; ensure overflow chain is visible for tabs |

