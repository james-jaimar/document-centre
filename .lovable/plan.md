
# Fix FlipBook Cover/Back Rendering Using the Library’s Native Cover Mode

## What the documentation tells us

I reviewed the current preview code and the `react-pageflip` docs. The important behavior is:

- `showCover={true}` already makes the **first and last pages render as single pages**
- The library expects the **real first page** and **real last page** to be the cover endpoints
- The current implementation is fighting that behavior by:
  1. appending a fake blank page to force even length
  2. appending a fake back-cover card as the last page
  3. masking half the spread with an overlay instead of letting the library render the cover state naturally

That is why you are seeing “placeholder”/blank halves and wrong end-of-book behavior.

## Root cause

Right now the page sequence is modeled incorrectly.

```text
Current model:
[front cover][body...][back cover card][blank pad]

What the book should logically be:
[front cover][inside/body pages...][last printed page or blank inside back][back cover material]
```

For a 24-page document with a navy back cover:
- page 24’s reverse/inside back is blank if needed
- the **navy card is the final physical page/material**
- there should be **no extra visible white page on the right** when viewing the back cover
- front cover and back cover should be treated as true solo states, ideally centered like Mimeo

## Implementation plan

### 1. Rebuild the preview page model in `PreviewPanel.tsx`
Replace the “append and pad” approach with an explicit physical-sheet model.

Build a flat preview sequence that represents the actual object:
- front cover page
- document interior pages in order
- if needed, insert an **inside-back blank page** as real content only when the document/imposition requires it
- append the physical back cover card as the final page/material

Also add explicit roles for clarity:
- `front_cover`
- `body`
- `inside_back_blank`
- `back_cover_card`
- `tab`

The key change: stop adding a fake trailing blank just to satisfy the component.

### 2. Stop masking halves in `FlipBook.tsx`
Remove the current left/right overlay masks entirely.

Let `react-pageflip` handle single-page mode through `showCover={true}`. Then drive layout from the actual current page role:
- when current index is the first page, treat it as a solo front-cover state
- when current index is the final `back_cover_card`, treat it as a solo back-cover state

If the library leaves the solo page aligned to one side, then shift the whole rendered book container so the single page is **centered in the viewport**, matching the Mimeo reference.

### 3. Center solo cover states
Add a small layout mode in `FlipBook.tsx`:

```text
front cover: single page centered
middle spreads: two pages centered
back cover: single page centered
```

This should be done by shifting the book wrapper, not by painting over one half.

### 4. Fix page-number and navigation math
Update the page info logic in `PreviewPanel.tsx` so it reflects the actual visible state:
- front cover: `Page 1 of N`
- middle spreads: `Pages X–Y of N`
- back cover card: show the final material/page state correctly
- no “double blank” end state

Also update `goLast`, slider behavior, and visible-page calculations so they align with the new physical page model rather than the old “step by 2 plus padding” assumption.

### 5. Fix the binding spine alignment
The spine issue is now a layout anchoring problem.

Update `FlipBook.tsx` and `BindingSpine.tsx` so the spine is attached to the actual rendered book box:
- full `pageHeight`
- vertically centered with the rendered page stack
- no clipping from wrapper/shadow/layout transforms
- correct appearance in both solo and spread modes

## Files to update

- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/BindingSpine.tsx`
- `src/components/preview/previewTypes.ts`
- possibly `src/components/preview/PageEffects.tsx` only if the new `inside_back_blank` role needs distinct styling

## Expected result

After this change:

- front cover shows as **one centered page**
- back cover shows as **one centered page**
- no fake left/right placeholder halves
- no extra white page beside the navy/black back cover
- the last interior blank, if required, is modeled intentionally rather than as a rendering artifact
- spine runs full height again
- behavior matches the Mimeo reference much more closely because we stop fighting the library’s native cover logic
