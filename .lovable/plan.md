

# Fix PVC Cover White-at-Rest + Eliminate Margin Drift

## Two bugs

### 1. PVC cover front renders solid white until hover
`react-pageflip` renders pages to an internal canvas for the static (non-animating) state. The `PageEffects` wrapper for `pvc_cover_front` sets `backgroundColor: "transparent"` — but transparent on a canvas = white. The artwork image is there but the canvas doesn't pick it up at paint time because the background is transparent.

**Fix**: Remove `backgroundColor: "transparent"` and instead don't set any explicit background on the PVC wrapper. The image itself fills the space. Also ensure the image for PVC uses `object-cover` instead of `object-contain` so there are no gaps for white to leak through.

### 2. Margins jump and become asymmetric after option changes
The spacing logic is split across TWO layers:
- **FlipPage** (line 74): applies `border: 1px solid rgba(0,0,0,0.15)` on non-material pages
- **PageEffects** (line 158): applies `padding: 3%` for bleed margin

The 1px border in FlipPage shrinks the available area by 2px total, making the PageEffects padding calculation relative to a slightly smaller box. When `react-pageflip` remounts (bookKey change), its internal size calculations can interact differently with this border, causing the asymmetric appearance. The border is also rendered at the FlipPage level which is captured by the library's canvas — if the library re-measures after mount, the border + padding combination drifts.

**Fix**: Move ALL visual edge styling into `PageEffects` only. Remove the border from FlipPage entirely. In PageEffects, for standard paper pages, render the border as an inset box-shadow (which doesn't affect layout) and keep the padding for bleed. This makes the entire visual treatment happen in one place with zero layout side-effects.

## Changes

### `src/components/preview/FlipBook.tsx`
- Remove `border` and `boxShadow` from FlipPage's outer div style (line 74-76) — make it a plain container for ALL page types
- The outer div becomes just `width/height: 100%, position: relative, overflow: hidden` with no visual styling

### `src/components/preview/PageEffects.tsx`
- For standard pages (body, front_cover): add `boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15), inset 0 0 8px rgba(0,0,0,0.10)"` to the outer wrapper — this gives the same visual border without affecting layout
- For `pvc_cover_front`: remove `backgroundColor: "transparent"`, just let the content fill naturally
- For material roles: no inset shadow (they already bypass)
- For blank paper roles: add the same inset shadow as standard pages

### Result
- Border is purely cosmetic (inset shadow), so it never interacts with padding calculations
- PVC front shows artwork through the overlay at rest, not white
- All visual styling lives in ONE component — no split between FlipPage and PageEffects
- Margin consistency is guaranteed because there's only one source of spacing

## Files to edit
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`

