
## Fix the native cover mode so we stop exposing the hidden spread half

### What I found
The page sequence is not the main problem anymore. The real issue is in `FlipBook.tsx`:

- `showCover={true}` is enabled correctly
- but we then **translate the entire book/spread wrapper**
- that wrapper still has the **full two-page canvas width**
- so when the first/last page is in native single-page mode, we are still visually exposing the other half of the spread area, which reads as a ghost page
- the spread-level shadow/wrapper styling makes that ghost half even more obvious

So yes: we are still fighting the library’s native cover handling, but now it is happening at the **layout/viewport level**, not just in the page data.

### Implementation plan

1. Rework `FlipBook.tsx` around a viewport model, not spread translation
- Remove the current `bookTranslateX` approach on the full book wrapper.
- Introduce a **role-aware viewport** around `HTMLFlipBook`:
  - spread state: viewport shows full book width
  - front cover: viewport crops to only the visible cover side
  - back cover: viewport crops to only the visible back-cover side
- Keep the pageflip instance intact; only change what portion of it is visible.

2. Stop styling the whole spread like a page
- Remove or conditionalize the current outer spread shadow wrapper in solo states.
- Keep page-level shadows/borders on the actual page surface only.
- This prevents the hidden half of the pageflip canvas from looking like a real blank page.

3. Keep the binding outside the cropped content area
- Anchor `BindingSpine` to the outer stage, not to the cropped book content box.
- That way the spine stays visible in:
  - front-cover solo view
  - middle spreads
  - back-cover solo view
- Make sure it remains full-height and centered on the hinge line.

4. Tighten the solo-state detection
- In `FlipBook.tsx`, drive solo logic from explicit first/last page roles, not generic wrapper assumptions.
- Treat these as the only solo states:
  - `front_cover`
  - final `back_cover_card` or final valid last page
- Remove leftover assumptions that “solo” means “translate the full spread”.

5. Audit `PreviewPanel.tsx` so it only supplies real physical pages
- Keep the explicit page-role model.
- Re-check the parity logic for `inside_back_blank` so it is only added when physically required.
- Do not add any extra placeholder/pad page just to help rendering.

### Files to update
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/BindingSpine.tsx`
- `src/components/order/PreviewPanel.tsx`

### Technical details
```text
Current bad behavior:
[full spread viewport] + [translate whole book]
=> native single cover is still inside a 2-page visual box
=> hidden half becomes a “ghost page”

Target behavior:
front cover  -> crop viewport to solo cover width, keep spine visible
middle spread -> show full spread
back cover   -> crop viewport to solo cover width, keep spine visible
```

### Expected result
- front cover shows as a true single page with no left ghost page
- back cover shows as a true single page with no right ghost page
- binding remains visible in all states
- no fake placeholder look from the hidden half of the pageflip canvas
- behavior matches the Mimeo reference much more closely
