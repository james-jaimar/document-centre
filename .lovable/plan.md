

# Fix Back Cover Edge-to-Edge + Add Flippable PVC Cover Page

## Two issues

### 1. Back cover card still showing white edges
The `PageEffects` wrapper div (line 69) has `backgroundColor: paperBg` (white). Even though the inner card div covers the full area, the 1px of the outer wrapper or slight sub-pixel rendering can leak through. Additionally, the `FlipPage` border check only looks at `pageRole === "back_cover_card"` but if the role isn't flowing through perfectly on remount, it falls back to showing borders.

**Fix**: For `back_cover_card` pages, set the outer wrapper background to the card color too (not white), so there's zero chance of white leaking. Also ensure FlipPage's border/shadow removal is robust.

### 2. PVC cover should be a flippable transparent page (like Mimeo)
Currently the PVC overlay is just a CSS layer on top of the front cover page. Mimeo models it as an actual separate page that flips independently — when you turn the cover, you see a semi-transparent sheet flipping over, revealing the printed page beneath.

**Fix**: When a PVC front cover is selected (`clear_pvc`, `frosted_pvc`, or `matte_pvc`), insert an extra page at index 0 in the page sequence that represents the physical PVC sheet. This page:
- Shows the document thumbnail underneath with the PVC overlay effect
- When flipped, the back side (page 1 in the spread) shows as a light translucent gray sheet
- The actual printed front cover becomes page 1 (now visible as the right page after flipping the PVC)

## Changes

### File: `src/components/order/PreviewPanel.tsx`
- In the `finalPages` builder, when `effects.frontCover` is a PVC type and `isBound`, insert an extra page at position 0:
  - Same thumbnail URL as the original front cover
  - Role: `"pvc_cover"` 
  - The original front cover page keeps role `"front_cover"`
- Adjust parity logic to account for this extra page

### File: `src/components/preview/PageEffects.tsx`
- Add handling for `pageRole === "pvc_cover"`:
  - Apply the PVC overlay effect (clear/frosted/matte) over the page content
  - This page renders the same thumbnail with the overlay on top
- Add handling for `pageRole === "pvc_cover_back"` (the reverse side when flipped):
  - Show as a light translucent gray sheet (like Mimeo's approach)
- For `back_cover_card`: set the outer wrapper `backgroundColor` to the card color instead of `paperBg`, eliminating any white bleed-through

### File: `src/components/preview/FlipBook.tsx`
- Add `"pvc_cover"` to the card cover check so it gets no border (it's a plastic sheet, not paper)
- The PVC cover page should be treated as a cover page by `showCover={true}` (it's at index 0, so it already is)

### File: `src/components/preview/previewTypes.ts`
- No changes needed — existing types cover this

## PVC page sequence example

Without PVC:
```text
[front_cover] [body] [body] ... [inside_back_blank?] [back_cover_card?]
```

With PVC cover (e.g., frosted):
```text
[pvc_cover] [front_cover] [body] [body] ... [inside_back_blank?] [back_cover_card?]
```

- Page 0 (solo cover): shows the document thumbnail with frosted overlay
- Flip page 0: left side shows light translucent gray (back of PVC), right side shows the printed front cover
- Rest of the book works as before

## Expected result
- Back cover card always renders as solid edge-to-edge color with zero white edges
- PVC covers flip independently as a semi-transparent sheet
- After flipping the PVC, the back of it shows as a light translucent page
- The printed front cover is revealed underneath
- Matches the Mimeo reference behavior closely

