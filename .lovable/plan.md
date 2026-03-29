
Fix the preview by modeling physical cover sheets correctly instead of faking them as one-sided visual effects.

## What’s actually conflicting now

The current implementation is mixing:
- a page sequence that mostly represents printed document pages
- visual roles that try to represent physical materials (PVC front, black card back)

That causes the wrong faces to appear when flipping:
- `pvc_cover` is inserted as only one page, so its reverse side is never modeled
- `back_cover_card` is only modeled as the final solo page, so its inside face is missing from the prior spread
- spread labels/navigation still assume `currentPage` and `currentPage + 1` are the visible pair, which is no longer reliable once extra physical sheets are inserted
- some border/margin drift is likely because the physical sequence is incomplete, so the same DOM/page slot ends up representing different real-world faces over time

## Clean implementation approach

### 1. Rebuild the bound page sequence as physical sheets
In `PreviewPanel.tsx`, stop treating covers as styling-only add-ons.

Build the final sequence as actual physical faces in order:
```text
[pvc_front_outside?]
[pvc_front_inside?]
[printed_front_cover]
[body...]
[inside_back_card?]
[back_cover_card]
```

Rules:
- If front cover is PVC, insert two faces:
  - outside = frosted/clear/matte overlay over the front artwork
  - inside = translucent reverse side of that PVC sheet
- If back cover is card, insert two faces:
  - inside face = solid black/navy/etc on the right side of the last spread
  - outside face = solo final back cover
- Only insert `inside_back_blank` when there is genuinely a blank physical inside face needed

This makes the page order deterministic and removes the need for hacks later.

### 2. Add explicit page roles for both sides of special materials
Extend role usage so rendering is face-based, not inferred:
- `pvc_cover_front`
- `pvc_cover_back`
- `front_cover`
- `body`
- `inside_back_cover_card`
- `back_cover_card`

This keeps `PageEffects.tsx` simple and makes each page render one thing only.

### 3. Update PageEffects to render each role explicitly
In `PageEffects.tsx`:
- `pvc_cover_front` = artwork + frosted/clear/matte overlay
- `pvc_cover_back` = translucent/light grey plastic reverse side
- `inside_back_cover_card` = solid card colour, edge-to-edge
- `back_cover_card` = same solid card colour, edge-to-edge

Also make card/PVC roles consistently bypass:
- white bleed padding
- paper tint logic
- paper-style borders/shadows

That should eliminate the inconsistent white edge problem.

### 4. Update FlipBook so “special material pages” are treated as material sheets, not paper pages
In `FlipBook.tsx`:
- treat both PVC roles and both card-back roles as non-paper sheets
- keep the remount key, but make sure it reflects the new final roles/page order
- keep solo/spread logic driven by `currentPage`, but verify it uses the new physical last page correctly

This keeps the native `showCover` behavior while aligning it to a correct page sequence.

### 5. Fix PreviewPanel’s visible-page info to follow the real sequence
The current info logic assumes:
- front solo at page 0
- spread = `currentPage` + `currentPage + 1`
- back solo only on final page

That breaks once PVC and inside-back-card pages exist.

Update the visible-page calculation so labels and badges are derived from the actual final page roles:
- first solo page = front material outside
- first spread after flip = left PVC reverse, right printed front cover
- last spread before final back = left prior printed page, right inside back card
- final solo page = outer back card

### 6. Keep the code clean by removing stale one-sided assumptions
As part of the refactor, remove any logic that assumes:
- PVC is only a single extra page
- back cover card only exists as the very last page
- `inside_back_blank` should always be inserted before a card back

This is the main cleanup that should stop the “it works once, then gets confused” behavior.

## Files to update
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/PageEffects.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/previewTypes.ts` (if you want the new page-role vocabulary documented clearly)

## Expected result
- frosted/clear/matte front behaves like a real flippable sheet
- when opened, left page shows the translucent PVC reverse and right page shows the printed front cover
- black/navy card back appears on both faces:
  - right side of the final spread
  - final solo back cover
- margins/borders stop jumping because each page slot has one stable physical meaning
- repeated option changes stay consistent because the book sequence itself is now correct
