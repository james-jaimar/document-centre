
## Fix the physically impossible tab/insert spreads

I inspected the current implementation, and the core problem is now clear:

- `buildPageSequence()` in `src/components/order/PreviewPanel.tsx` is already doing the right physical thing for simplex pages:
  - printed page
  - natural reverse face (`blank_back`)
  - then tab/insert sheet
- But the bound preview uses `react-pageflip` with `showCover={true}` in `src/components/preview/FlipBook.tsx`, which changes how page indices are displayed in spreads.
- Right now the preview/navigation layer is still treating raw array indices as if they directly equal left/right physical page numbers, so the tab/insert sheet is being displayed as though it starts too early on the spread.

## What to change

### 1. Separate physical face sequence from displayed page numbering
In `src/components/order/PreviewPanel.tsx`:

- keep `finalPages` exactly as a list of physical faces
- add a second derived array for **display page numbers**
- for simplex body sheets:
  - front face gets printed page N
  - `blank_back` gets printed page N+1
- for tab/insert sheets:
  - front gets the next printed page number
  - back gets the following printed page number

This gives the preview a correct “printed page label” model instead of assuming `index + 1`.

### 2. Pass explicit display numbers into the preview
In `src/components/preview/DocumentPreview.tsx` and `src/components/preview/FlipBook.tsx`:

- add a prop like `displayPageNumbers?: number[]`
- stop deriving visible page numbers from `currentPage`, `currentPage + 1`, or `urls.length`
- render the bottom page numbers from the explicit display-number array

This is the piece currently making “page 7/8” appear where the physical sequence should actually be “page 8/9”.

### 3. Fix spread info text to use displayed printed numbers
In `src/components/order/PreviewPanel.tsx`:

- replace `Pages ${currentPage + 1}–${currentPage + 2}` with text derived from the visible faces’ display page numbers
- do the same for solo-page states

That will align the caption under the preview with the actual physical/printed sequence.

### 4. Keep the insertion rule exactly as sheet-completion
Do not reintroduce any index patching.

The rule should remain:

```text
after page 6 in simplex:
page 6 front
page 7 back of same sheet
page 8 tab front
page 9 tab back
```

and similarly for inserts.

### 5. Verify bound preview assumptions around `showCover`
In `src/components/preview/FlipBook.tsx`:

- keep `showCover={true}` if needed for the solo front-cover behaviour
- but make all visible numbering and spread labelling independent of the flipbook’s raw page index assumptions

That avoids another round of “fixing physics in the sequence” when the real bug is the display model.

## Files to update

- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/DocumentPreview.tsx`
- `src/components/preview/FlipBook.tsx`

## Expected result

For a simplex job with a tab after page 6:

```text
physical faces:
6 front
7 back of same sheet
8 tab front
9 tab back
```

And the preview should show that correctly:
- the spread before the tab still contains the reverse of the previous sheet
- the tab starts on the next right-hand face
- inserts follow the exact same rule
- no tab or insert appears to start on the left side of a spread

## Technical note

The sequence builder is no longer the main bug. The current issue is that the viewer is displaying and labelling physical faces as if `array index === printed page number`. The implementation should preserve the current physical-face ordering and fix the preview’s numbering/spread interpretation layer so it matches the actual sheet model.
