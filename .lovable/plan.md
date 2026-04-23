

## Simplify ring binder to static page rendering (no flipbook)

### Problems

1. **Cover artwork not rendering** — The closed-state branch at `currentPage === 0` checks `urls[0]`, but if the URL is empty or fails to sign, it falls through to a white rectangle silently.

2. **Left-side page curl** — The left `HTMLFlipBook` has `showPageCorners={true}` and `overflow: "visible"`, so react-pageflip draws interactive curl corners on the far-left edge, outside the binder frame.

3. **Both flipbooks contain ALL pages** — `renderPages()` dumps every page into both the left and right `HTMLFlipBook`. Each instance is independently interactive, producing phantom curls and impossible left-side tab artifacts.

### Root cause

Using two full `HTMLFlipBook` instances for ring binders is architecturally wrong. Ring binder pages do not flip like a bound book — you physically lift individual pages over the rings. The dual-flipbook approach creates synchronisation bugs, phantom curls, and interaction zones that leak outside the binder frame.

### Solution: static page rendering

Replace the dual-flipbook open state with two static page `div`s (left page and right page). Navigation is handled entirely by the external prev/next arrows and slider that `PreviewPanel` already provides. No flip animation needed — this is more physically accurate and eliminates all the dual-book complexity.

### Changes to `src/components/preview/RingBinderOpenSpread.tsx`

**Remove:**
- Both `HTMLFlipBook` instances and the `renderPages()` function
- The `onLeftFlip` / `onRightFlip` callbacks and `isSyncing` ref
- The `leftRef` / `rightRef` refs and their `useEffect` sync logic
- All react-pageflip-related props (`showPageCorners`, `flippingTime`, etc.)

**Replace with:**
- Two simple `div` containers positioned in the existing binder layout (left page area, center gap, right page area)
- Left div renders `RingFlipPage` (already exists, just a styled div) for `currentPage - 1` — or a white blank if `currentPage === 1` (inside front cover)
- Right div renders `RingFlipPage` for `currentPage` — or a white blank if `currentPage >= urls.length` (inside back cover)
- The `RingOpenSpread` component simplifies to a pure layout component with no animation state
- Optional: add a subtle CSS `transition` on opacity when pages change for a smooth visual effect

**Keep unchanged:**
- Closed-cover state at `currentPage === 0` (binder PNG + cover artwork pocket)
- Binder background PNG positioning and inset geometry
- `RingTabOverlay` (right-edge-only tabs)
- `RingFlipPage` component (reused as the static page renderer)
- All `PageEffects` integration

**Fix cover detection:**
- Add a loading/fallback state for the cover: if `urls[0]` is truthy but the image fails to load, show a placeholder instead of silently rendering nothing

### Result

- Cover artwork renders correctly when a printed cover is uploaded
- No phantom page curls — pages are static divs, not interactive flipbooks
- No left-side interaction artifacts
- Tabs remain right-edge-only and physically correct
- Navigation works via existing external controls (arrows, slider)
- Simpler code, no synchronisation bugs, no animation state to manage

### Files to change

| File | Change |
|---|---|
| `src/components/preview/RingBinderOpenSpread.tsx` | Replace dual-HTMLFlipBook with static left/right page divs; fix cover fallback |

