
Simplify the bound preview instead of layering more fixes on top.

## What the docs confirm

`react-pageflip` with `showCover={true}` already does this natively:
- first page = single cover page
- last page = single cover page

So the remaining bugs are coming from our own wrapper logic around it, not from the library itself.

## What is currently conflicting

### In `FlipBook.tsx`
We are still overriding native cover behavior in a few ways:
- cropping a full two-page canvas with custom `viewportWidth` and `canvasOffsetX`
- deciding solo states with broad index checks instead of strict role checks
- adding a spread-level outer shadow on the viewport, which makes hidden/empty areas visible
- positioning the spine relative to the viewport box instead of the actual visible page edge

That explains:
- white line/ghost edge on the front cover
- spine sitting in the middle of a solo page
- back cover looking correct as a full card, but still with the spine in the wrong place

### In `PreviewPanel.tsx`
The page sequence is mostly reasonable now, but it still needs to be treated as a physical sequence only:
- `front_cover`
- interior/body pages
- optional `inside_back_blank` only when physically required
- optional `back_cover_card` as the real final page

The renderer should not add extra visual assumptions on top of that.

## Cleanup plan

### 1. Strip `FlipBook.tsx` back to a minimal native-cover wrapper
Refactor `FlipBook.tsx` so it does only three jobs:
- size the book
- pass real pages into `HTMLFlipBook`
- detect whether the current page role is:
  - `front_cover`
  - interior spread
  - `back_cover_card` / real last solo page

Then remove the extra viewport/shadow logic that is faking layout around the library.

### 2. Replace index-based solo logic with explicit role-based logic
Use `pageRoles[displayPage]` plus “is last page” as the source of truth.

Target:
- front cover solo only when current role is `front_cover`
- back cover solo only when current role is `back_cover_card`, or when the real final page is intentionally solo
- no generic `>= lastPageIndex` shortcuts

This will make the renderer easier to reason about and stop accidental solo/spread mismatches.

### 3. Re-anchor the spine to the visible page edge, not the viewport center
Update the layout so the spine is positioned against the actual hinge of the currently visible page state:
- front cover solo: left edge of the visible page
- spread: center hinge
- back cover solo: right edge of the visible page

This should be calculated from the rendered page mode in `FlipBook.tsx`, with `BindingSpine.tsx` staying dumb/presentational.

### 4. Remove spread-level framing that creates false edges
Delete the outer box shadow/border treatment on the cropped viewport wrapper.
Keep page-edge styling only on the real page surface.

That should eliminate the front-cover white line and any remaining ghost-page framing.

### 5. Keep back-cover card styling fully role-driven
Leave `back_cover_card` as a true edge-to-edge material:
- no bleed padding
- no page border
- no inset page shadow

Only ordinary printed pages should get the printed-page edge styling.

### 6. Lightly audit `PreviewPanel.tsx` after the cleanup
Do one pass to ensure:
- `inside_back_blank` is only inserted when physically needed
- navigation labels still match the physical sequence
- no UI text assumes every bound state is a two-page spread

## Files to update

- `src/components/preview/FlipBook.tsx`
- `src/components/preview/BindingSpine.tsx`
- `src/components/order/PreviewPanel.tsx`
- possibly `src/components/preview/PageEffects.tsx` for any remaining printed-page-only styling split

## Expected result

After this cleanup:
- front cover is a true single centered page
- no extra white line / ghost left page
- back cover remains a full solid card
- spine sits on the correct edge in solo states
- spread states still render normally
- the implementation becomes simpler because we stop fighting `react-pageflip`’s native cover mode
