## Goal
For landscape (top-bound) documents, render the **exact same** tab artwork as portrait — same SVG path, same dimensions, same banking layout, same label orientation — and just rotate the whole strip 90° clockwise so it protrudes from the bottom edge. No bespoke landscape geometry.

## Why
Current landscape branch re-derives tab width/height/positions from `pageWidth`, which produces noticeably different proportions (squatter trapezoids, wider gaps, smaller labels) than portrait. The user wants the physical reality: same portrait tab pack, rotated.

## Change — `src/components/preview/FlipBook.tsx`

### `TabOverlay`
1. **Delete** the `isBottomEdge` branches inside both the ahead/current and behind blocks (the two custom layouts that compute `segmentWidth = pageWidth / bankSize`, swap viewBox, and apply per-tab `rotate(90deg)`).
2. Keep the existing portrait (right/left edge) rendering as the single source of truth — its slot math uses `pageHeight / bankSize`, which is exactly what we want the rotated landscape strip to also use (slots distributed along what becomes the bottom edge after rotation).
3. When `bindingEdge === "top"`, wrap the **entire** returned `<div>` (currently `style={{ width: spreadWidth, height: pageHeight, overflow: "visible" }}`) in an outer transform:
   - `transform: rotate(90deg)`
   - `transformOrigin: "0 0"` (top-left)
   - Followed by a translate so the rotated strip lands at the page's bottom-left: `translate(0, -spreadWidth)` after rotation, i.e. the combined transform is `translate(0, pageHeight) rotate(-90deg)` if we rotate counter-clockwise from bottom-left, OR `rotate(90deg) translate(0, -spreadWidth)` for clockwise from top-left. Use whichever single transform pair lands the right-edge strip exactly on the bottom edge with tabs pointing downward (clockwise rotation per user spec — Tab 1 ends up at the left of the bottom edge).
4. The inner rendering stays untouched: same `pathD(tabWidth, tabHeight)`, same `viewBox`, same drop-shadow, same `writing-mode: tb` label, same banking math, same behind/ahead split (which after rotation correctly puts "ahead" tabs under the right page and "behind" tabs under the left page).

### Wrapper sizing (`FlipBook` outer container, around line 489 `isBottomTabEdge`)
- Keep current logic: `wrapperHeight = displayedPageHeight + bottomTabGutter`, `sideGutter = 0`. No change here — the bottom gutter still reserves space for the now-rotated strip whose protrusion length matches the portrait `protrusion = 22`px.

## Out of scope
- Portrait rendering: unchanged.
- Ring binders: unchanged.
- Backend / production PDF / pricing: unchanged.
- Tab colors, labels, banking rules, count: unchanged.

## Verification
- Landscape preview: tabs along the bottom edge look **pixel-identical** to portrait tabs rotated 90° CW — same rounded-protrusion shape, same width, same label size and orientation, same shadow direction relative to the protrusion.
- Flip through pages: behind tabs sit under the left page's bottom, ahead/current under the right page's bottom.
- Portrait preview: unchanged.
