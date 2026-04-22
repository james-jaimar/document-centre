

## Ring binder preview — back to first principles

### Root cause of the current mess

The current code does two wrong things:

1. **It always injects a PVC front sheet for ring binders, even when no cover is uploaded.** Then when grabbing the "front cover artwork" it does `frontThumb = fp[0]?.thumbnailUrl`, which is the **first body page**. That is literally why your body page is showing up as the front cover artwork.
2. **There is no ring-specific open-state renderer anymore.** Once past page 0, ring binders fall through to the standard wire/comb/perfect/saddle renderer with no binder background, no widened centre gap, and no ring mechanism — which is why the inside looks like a normal saddle-stitched spread with a wire spine.

This is also why the "Page 1 — Blank (Back)" label appears with your body image bleeding through — it is the injected `pvc_cover_back` blank face.

### Correct model (what you actually asked for)

- **Front view = closed binder image**
  - if a cover sheet is uploaded → overlay that file in the pocket
  - if no cover sheet → show the closed binder with a plain blank pocket, **do not** invent a PVC front sheet from a body page
- **Inside view = open binder image as background + the wire-bound flipbook on top**
  - same flip animation as wire-bound
  - no wire spine drawn
  - the two pages are pushed apart so the centre gap clears the ring mechanism
- Inside spread starts on the right-hand side (page 1 solo right), exactly like wire-bound's first page

### Implementation

#### 1) Stop forcing PVC injection for ring binders without an uploaded cover
In `PreviewPanel.tsx`:

- Keep PVC front-sheet injection **only when** `effects.frontCover` is one of `clear_pvc | frosted_pvc | matte_pvc` (the existing `isPvcOption` rule).
- Remove the `(isRingBinder && fp.length > 0)` clause that forces PVC for ring binders unconditionally.
- Set `hasRealFrontCover = computedPageRoles[0] === "front_cover" || computedPageRoles[0] === "pvc_cover_front"` — i.e. derived from real data, not hard-coded `true`.
- Same fix mirrored in `buildPreviewSnapshot.ts` so saved orders match.

This single change kills the "body page appears as cover" bug.

#### 2) Make the closed front state conditional in `FlipBook.tsx`
- Render the closed binder image at `currentPage === 0` **only when** `hasRealFrontCover` is true (real cover) OR when the user explicitly has a cover artwork file at index 0.
- When no cover exists, ring binder skips the closed state entirely and lands on the open spread immediately at page 0.

#### 3) Rebuild a real ring-binder open state (binder background + wire-bound flipbook with widened gap)
This is the part that has been missing. Add a dedicated ring-binder open-state branch in `FlipBook.tsx` that runs **before** the standard bound renderer:

- Render the `ring_binder_white_open.png` background at its natural aspect ratio, centred in the available area.
- Compute a content rectangle inside the artwork (`RING_CONTENT` inset already exists) and split it into two page rectangles with a configurable **`RING_CENTER_GAP`** (e.g. ~10–14% of artwork width) between them — this is the space that clears the rings.
- Inside that, mount the **same `HTMLFlipBook`** used by wire-bound, with the **same `BASE_PAGE_WIDTH` / `basePageHeight`** approach, the same `showCover`, same solo-page detection, same tab overlay, same back-cover handling — but:
  - `BindingSpine` is **not** rendered (no wire down the middle)
  - the flipbook stage is CSS-scaled into the two page rectangles, with the centre gap baked into the layout
  - the ring mechanism strip from the artwork sits visually behind the gap (no overlay needed — it's part of the background image)

Use a single shared bound-render function so ring inherits all wire-bound flip/clip/solo behaviour automatically; ring just supplies (a) a background image, (b) a wider centre gap, and (c) "no spine".

#### 4) About the centre gap — `react-pageflip` constraint
`react-pageflip` does not support a built-in gutter between the two pages of a spread (pages always meet at the spine). To create the visual gap for the ring mechanism, the gap is faked in the **outer layout**, not inside the flipbook:

- The flipbook itself stays as a normal spread (pages touching).
- Wrap left and right halves in two separate scaled containers positioned over the two page rectangles with the gap between them. Because `react-pageflip` renders the whole spread as one DOM block, we instead:
  - keep a single flipbook
  - scale it to fit the **combined** page width (`leftPageW + rightPageW`)
  - position it inside the artwork content area where the centre line of the flipbook spread aligns with the centre of the ring mechanism
  - cover the centre seam with an overlay strip from the open binder artwork (just the rings cropped out, sitting at `z-index` above the pages)

That overlay strip is the realistic way to make the rings appear to sit over the page edges without breaking the flipbook's internal geometry. **If at QA this overlay still looks wrong, I'll come back to you with the alternative (rendering left/right pages as two separate flipbooks side by side, which loses the page-flip animation across the spine).**

#### 5) Fix labels and counters
In `PreviewPanel.tsx`:
- `pageInfoText`: only show "Front Cover" when `hasRealFrontCover` is genuinely true (not the always-true override).
- Remove the hard-coded `hasRealFrontCover = true` and derive it from `computedPageRoles[0]`.
- Step stays at `2` for ring binders.

### Files to change

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | Remove unconditional ring-binder PVC injection; derive `hasRealFrontCover` from real roles; correct `pageInfoText` |
| `src/lib/orders/buildPreviewSnapshot.ts` | Same parity fix — no PVC injection unless the cover option/section actually exists |
| `src/components/preview/FlipBook.tsx` | Closed front state only when real cover exists; new ring-binder open-state branch reusing the wire-bound flipbook with no spine, widened centre gap, and the ring mechanism artwork overlaid over the spine |

### Result

- **No cover uploaded** → straight to open binder view, first body page solo on the right, no fake PVC cover with body artwork
- **Cover uploaded** → closed binder front with that cover in the pocket; flipping forward goes into open binder spreads
- **Inside** → real open binder background, wire-bound flipbook on top, no wire down the centre, gap between pages for the rings, last page no longer disappears (because it inherits wire-bound end-state logic)
- Tabs and inserts continue to work because the ring open state is the wire-bound renderer

