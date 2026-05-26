## Goal
For landscape presentations (top-bound), render the existing portrait tab dividers rotated so they protrude from the **bottom edge** of the page instead of the right/left side edges. Portrait documents are unaffected.

## Why
A4 landscape plastic tabs don't realistically exist in the South African market. Real-world workflow: print shop uses standard portrait tab packs, rotated 90° so the tab cuts end up along the bottom of the landscape page. The preview should mirror this so customers see what they'll actually get.

## Scope
Preview rendering only. No DB changes, no pricing changes, no production-PDF / imposition changes. The same tab artwork, colours, banking, and labels are reused — only their position/rotation in the preview changes.

## Changes

### `src/components/preview/FlipBook.tsx` — `TabOverlay`
1. Accept a new prop `bindingEdge: "left" | "top"` (already threaded into `FlipBook` from `bindingEdge` — just forward it into `TabOverlay`).
2. When `bindingEdge === "top"` (landscape):
   - Lay tabs out along the **bottom edge** of the page (free edge opposite the binding).
   - Tab strip becomes horizontal: protrudes downward, `tabWidth` becomes the "along the edge" dimension and `tabHeight` (now the visible protrusion) stays ~22px.
   - Slot positioning uses page **width** instead of page height to space tabs across the bottom.
   - Behind/ahead logic: still shows ahead/current tabs on the right-hand page bottom, behind tabs on the left-hand page bottom (mirroring current left/right vs. above/below behaviour but along the bottom edge).
   - SVG path is the same rounded-protrusion shape but rotated so the curve faces downward; label text rotates accordingly so it reads correctly when the customer tilts their head (same convention as current side tabs).
3. The `tabGutter` in the outer wrapper (line 418) becomes a **bottom gutter** when `bindingEdge === "top"` (extra vertical space below the spread instead of horizontal space beside it).

### `src/components/preview/FlipBook.tsx` — wrapper sizing
- When `bindingEdge === "top"`: `wrapperWidth = displayedViewportWidth` (no side gutter), `wrapperHeight = displayedPageHeight + bottomTabGutter`.
- Tab overlay container is positioned along the bottom of the spread instead of overlapping the right/left edges.

### No other files
- `tabPositions`, `bankPosition`, colour resolution, label truncation, banking (≤10 per pack, multi-bank stacking) all reused as-is.
- `BindingSpine`, page rendering, and `RingBinderOpenSpread` are untouched (ring binders already handle landscape separately).
- Production merge / `buildJobSnapshot` / order pricing are untouched — the physical tab pack ordered is identical; only the preview rotates them.

## Out of scope
- Letting users choose top vs. side tab placement on landscape (always bottom for landscape, always side for portrait).
- Any change to portrait tab rendering.
- Ring-binder landscape handling.
- Backend/production changes.

## Verification
- Open a landscape Presentation with tab dividers → tabs appear protruding from the bottom edge, banked correctly, with the right colours and labels.
- Open a portrait Bound Document with tab dividers → unchanged (tabs still on the right/left side edges).
- Flip through pages → behind tabs appear under the left page bottom, ahead tabs under the right page bottom.