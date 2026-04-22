
## Fix ring binders by restoring the actual flip-book stack and layering binder artwork behind it

### What is actually wrong

The current ring binder path is failing in two specific places:

1. `FlipBook` is still a plain white page-stage with only a synthetic centre strip. It never renders the real ring binder artwork (`ring_binder_white_closed.png` / `ring_binder_white_open.png`), which is why there is no cover/inside background image.
2. `FlipBook` still hard-codes `showCover={true}` and `isShowingFrontCover = currentPage === 0`, so ring binders always behave as if they have a cover state, even when the first real face is body content. That is why “No Cover” still shows a cover and why the spread logic drifts.

### Target behaviour

Ring binders should use the same `react-pageflip` spread model as wire bound documents, with only these differences:

- real binder artwork behind the pages
- wider centre gutter for the D-ring mechanism
- no dedicated spine image
- no cover state unless a real `front_cover`/cover-sheet face exists

That means:

- **With Cover Sheet**: closed/front state first, then normal inside spreads
- **Without Cover Sheet**: start directly on the open inside spread
- same flipping animation as wire binding
- same spread navigation (`step = 2`)
- same numbering model as other bound documents

### Implementation

#### 1) Keep ring binders on the unified `FlipBook` path
In `src/components/preview/DocumentPreview.tsx`:

- keep `ring_binder` routed through `FlipBook`
- do not reintroduce any dedicated ring-binder component

This keeps one animation engine and one spread model.

#### 2) Rebuild the ring-binder visual layout inside `FlipBook`
In `src/components/preview/FlipBook.tsx`:

- import the real binder assets from `src/assets/bindings/`
  - `ring_binder_white_closed.png`
  - `ring_binder_white_open.png`
- render the binder artwork as a separate background layer behind the flipbook stage
- preserve the image aspect ratio independently from the page stage so it never squashes
- define ring-binder layout geometry:
  - closed cover artwork box
  - open inside artwork box
  - printable left page area
  - printable right page area
  - widened centre hardware gutter
- keep the `react-pageflip` stage at its fixed internal measurement size, but place it inside a ring-specific masked viewport above the artwork
- for open spreads, inset both pages away from the centre so the visible content sits either side of the ring mechanism
- remove the current fake centre strip / circle-ring overlay approach
- continue skipping `BindingSpine` when `bindingType === "ring"`

Visually the structure should become:

```text
binder artwork background
  -> masked spread viewport
      -> left page area
      -> widened ring gutter
      -> right page area
          -> react-pageflip pages
```

#### 3) Make cover mode conditional, not automatic
Still in `src/components/preview/FlipBook.tsx`:

- derive `hasRealFrontCover` from `pageRoles?.[0]`
- only treat page 0 as a solo cover when the first role is an actual cover face:
  - `front_cover`
  - `pvc_cover_front`
- if the first role is `body`, do not use front-cover solo behaviour for ring binders
- drive `showCover` dynamically:
  - normal bound docs: keep existing cover behaviour
  - ring binder with real cover: `showCover=true`
  - ring binder without cover: `showCover=false`
- update `isShowingFrontCover`, solo-page clipping, viewport width, and centering logic to use this computed `hasRealFrontCover` flag instead of `currentPage === 0`

This is the key fix for “No Cover still shows a cover”.

#### 4) Correct spread centering for ring binders
In `src/components/preview/FlipBook.tsx`:

- compute the displayed width from the actual binder artwork box, not just `baseSpreadWidth + ringGapPx`
- separately compute:
  - page-stage scale
  - binder-artwork display size
  - overlay offsets that align the flip pages to the artwork
- ensure closed state is centered on the closed-binder background
- ensure open state is centered on the open-binder background
- adjust tab overlay width/offsets to follow the shifted printable area, not the old plain spread width

This fixes the current “flat sheets / static position / no correct inside placement” problem.

#### 5) Keep ring binders on normal spread navigation
In `src/components/order/PreviewPanel.tsx`:

- keep `step = 2` for ring binders
- remove any special single-sheet assumptions
- make front-cover text conditional on a real cover existing
- when there is no cover sheet, page info should start from the first inside spread rather than forcing “Front Cover”
- keep face labels and visible-left/visible-right logic aligned with the same `hasRealFrontCover` rule used by `FlipBook`

This restores numbering parity with the actual spreads being shown.

#### 6) Keep fullscreen/lightbox in sync
In `src/components/order/PreviewLightbox.tsx`:

- keep ring binders as bound products with `step = 2`
- no special ring-binder paging mode
- ensure the lightbox counter stays consistent with the same spread model as the main preview

#### 7) Preserve snapshot parity
In `src/lib/orders/buildPreviewSnapshot.ts`:

- keep the existing “only inject PVC cover pages when a real front cover section exists” rule
- review `faceLabels` generation so ring binders without a cover do not imply a front-cover state in persisted previews
- ensure snapshot data matches the new `FlipBook` expectations for conditional cover mode

### Files to change

| File | Change |
|---|---|
| `src/components/preview/DocumentPreview.tsx` | Keep `ring_binder` on unified `FlipBook` routing |
| `src/components/preview/FlipBook.tsx` | Add real ring binder background artwork, conditional `showCover`, wider centred gutter, proper stage/artwork alignment |
| `src/components/order/PreviewPanel.tsx` | Make page text and solo/spread logic depend on whether a real cover exists |
| `src/components/order/PreviewLightbox.tsx` | Keep ring binders on normal bound spread stepping |
| `src/lib/orders/buildPreviewSnapshot.ts` | Keep snapshot labels/roles consistent with no-implicit-cover behaviour |

### Result

After this rework, ring binders will work the way you described:

- real closed binder background behind the cover preview
- real open binder inside background behind the flipping spreads
- proper wire-bound-style page-flip animation
- wider centre gap for the O-ring hardware
- no fake cover when the customer only uploads body pages
- correct inside spread alignment and corrected numbering
