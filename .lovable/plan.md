## Terminology lock-in (so we stop confusing each other)

For a **landscape A4** page:
- **Short edge = 210 mm** = the LEFT/RIGHT side → bound here = vertical spine on left = **side-by-side spread** (like a normal portrait book turned sideways). Existing `*210mm.png` assets are correct for this.
- **Long edge = 297 mm** = the TOP/BOTTOM → bound here = horizontal spine across the top = **stacked spread** (page above / spine / page below). Needs the **new horizontal landscape artwork** you just uploaded.

So:
- `bindingEdge="left"` on a landscape doc → short-edge bind → 210mm vertical assets, side-by-side. **Default.**
- `bindingEdge="top"` on a landscape doc → long-edge bind → new horizontal landscape assets, stacked.

(Your earlier toggle "default short, switch to long" maps to `bindingEdge="left"` ↔ `bindingEdge="top"` for landscape docs.)

---

## Bug 1 — Preview is microscopic

`src/components/preview/FlipBook.tsx` lines 422–423 reference bare `outerWidth` / `outerHeight`. Those identifiers don't exist in the component, so JS resolves them to `window.outerWidth` / `window.outerHeight` — a wrapper several thousand pixels wide. The flipbook renders correctly inside it but everything around it gets pushed/scaled and the visible book ends up tiny.

**Fix:** compute a wrapper sized to the rotated book's actual footprint and use those.

```ts
// After scaleFactor is known, derive the rotated bounding box:
const wrapperWidth  = isTopBound ? displayedPageHeight                : displayedViewportWidth + tabGutter * 2;
const wrapperHeight = isTopBound ? displayedViewportWidth + tabGutter*2 : displayedPageHeight;
```
Use those in the outer wrapper instead of `outerWidth`/`outerHeight`. This restores the normal preview to its full size.

Also fix `availableWidth/availableHeight` (lines 382–383): when top-bound, the rotated book's width consumes container HEIGHT and vice versa — the swap is right, but right now `pageAspectRatio` is also inverted via `flipRatio = 1/ratio`, which double-counts. We should pick **one** of those two inversions, not both. Plan: keep the aspect inversion (`flipRatio`), drop the `availableWidth/availableHeight` swap so the preview fills its pane normally.

---

## Bug 2 — Use real horizontal artwork for top-bound long-edge

Today, top-bound long-edge re-uses the vertical portrait spine and just CSS-rotates the whole container. That's why the teeth look weird. You've now uploaded purpose-made horizontal art.

### Step A — copy uploaded art into the project

Copy the 10 new files into `src/assets/bindings/`:
- `coil_black_front_landscape.png`, `coil_black_open_landscape.png`
- `coil_clear_front_landscape.png`, `coil_clear_open_landscape.png`
- `coil_white_front_landscape.png`, `coil_white_open_landscape.png`
- `wire_black_front_landscape.png`, `wire_black_-_open_landscape.png`
- `wire_silver_front_landscape.png`, `wire_silver_open_landscape.png`

(Comb landscape art wasn't uploaded — it'll fall back to the rotated 210mm asset until you provide it. I'll note this in the resolver so it degrades cleanly.)

### Step B — extend the asset registry

`src/components/preview/bindingAssets.ts`:
- Add a third edge value: `BindingArtEdge = "long" | "short" | "top"`.
  - `long` = portrait spine (existing)
  - `short` = vertical 210mm assets (existing)
  - `top` = NEW horizontal landscape spine (just uploaded)
- Import the 10 new files and slot them under `ART[method][color].top.{open,closed}`.
- Update the fallback ladder so a missing `top` entry falls back to: same colour `short` → default colour `top` → default colour `short` → legacy. (This keeps comb working until horizontal comb art arrives.)

### Step C — drop the rotation hack from `BindingSpine.tsx`

- When `bindingEdge === "top"` AND `landscapeLongEdge === true` → request `edge: "top"`, render as a **horizontal strip** (full width, fixed height ~36px), no CSS rotation, no `scaleY(-1)`.
- When `bindingEdge === "top"` AND `landscapeLongEdge === false` → request `edge: "short"`, render as a vertical strip on the left (existing behaviour, side-by-side spread).
- When `bindingEdge === "left"` → unchanged.

### Step D — `FlipBook.tsx` layout for top-bound long-edge

Only the **long-edge top-bound** case needs the stacked layout. Short-edge bindings stay side-by-side.

- Introduce `const isStacked = bindingEdge === "top" && landscapeLongEdge;` (passed through; we already have both flags).
- Apply the 90° outer rotation + counter-rotation only when `isStacked`. For `bindingEdge="top"` without `landscapeLongEdge` (short-edge landscape), render as a normal side-by-side spread — no rotation, no counter-rotation. This alone will fix the "absolutely tiny preview" symptom for short-edge landscape docs.
- For `isStacked`, position the horizontal binding spine at vertical center (between the two stacked pages), full width, ~36px tall.

---

## Files to change

1. `src/assets/bindings/` — add 10 new PNGs (copied from uploads).
2. `src/components/preview/bindingAssets.ts` — add `"top"` edge, register new assets, extend fallback ladder.
3. `src/components/preview/BindingSpine.tsx` — render horizontal strip for `top + landscapeLongEdge`; keep vertical strip for `top + short edge` (no rotation, no flip).
4. `src/components/preview/FlipBook.tsx`:
   - Replace `outerWidth`/`outerHeight` with computed `wrapperWidth`/`wrapperHeight`.
   - Gate the 90° rotation + counter-rotation behind `isStacked` (top + long-edge only).
   - Restore normal side-by-side layout for short-edge landscape (the common default).

## Verification

- Run `tsc --noEmit` after the changes.
- Per the shared-preview-dependency-check memory, re-check all bound types in the preview: portrait wire/comb/coil/saddle/perfect (unchanged), landscape short-edge (side-by-side, normal size), landscape long-edge (stacked, horizontal spine with new artwork), ring binder (untouched, separate component).
- Spot-check that the normal-size portrait preview is back to its previous size on a 1142×715 viewport (your laptop).