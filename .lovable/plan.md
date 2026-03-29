
Fix the preview by separating three concepts cleanly: physical page sequence, visual page role, and blank-page rendering.

## What is actually wrong now

### 1. Blank simplex backs are inserted, but rendered like missing thumbnails
In `PreviewPanel.tsx`, simplex backs are being added correctly with:
- `thumbnailUrl: ""`
- `pageIndex: -1`

But in `FlipBook.tsx`, any page with no `url` falls into the generic placeholder UI:
- file icon
- “Page X” text
- muted gray background

That is why the back of a simplex front cover is not showing as a clean blank white sheet.

### 2. The inside back card is still being treated like a “paper page slot”
`inside_back_cover_card` is rendered as solid colour in `PageEffects.tsx`, but the outer `FlipPage` wrapper still contributes layout styling that is tuned for normal pages:
- the page border/shadow logic is only partly aware of material pages
- the inner placeholder branch for blank/missing thumbnails can still influence visual perception on non-image pages
- the standard page shell is not explicitly split between “paper sheet”, “material sheet”, and “intentional blank page”

That is the most likely source of the white edge appearing intermittently on the inside back cover.

### 3. Page-role logic is too coarse for bleed scope
`PageEffects.tsx` currently only treats `front_cover` as a cover page:
- `covers` bleed scope only applies to `front_cover`
- the final printed back page is never identified as a printed back cover role
- inserted simplex blanks inherit the default `body` behavior

So the margin logic is not being driven by true physical meaning. That makes it easier for borders to appear “wrong” after cover/material combinations change.

### 4. Display metadata is still derived from page indices, not physical semantics
The spread/page info in `PreviewPanel.tsx` still assumes:
- first page = cover
- middle pages = regular spreads
- last page = back cover only if role is `back_cover_card`

That is close, but not robust enough once the book includes:
- PVC front outside
- PVC front inside
- simplex blank backs
- inside back card
- solo outer back card

This is why the UI can look “nearly right” but still feel off when clients flick around.

## Clean fix

### A. Add explicit page kinds for intentional blanks and printed cover faces
In `PreviewPanel.tsx`, enrich the generated sequence so roles describe the physical face:
- `front_cover`
- `blank_back`
- `body`
- `pvc_cover_front`
- `pvc_cover_back`
- `inside_back_blank`
- `inside_back_cover_card`
- `back_cover_card`

Most importantly:
- simplex-inserted blank backs should get `blank_back`, not fall through as generic `body`
- keep printed front cover distinct from PVC material faces

This makes rendering deterministic.

### B. Render blank backs as actual blank paper
In `FlipBook.tsx`, stop using the file placeholder UI for every `url === ""`.

Instead split blank rendering into:
- intentional blank page (`blank_back`, `inside_back_blank`) → plain white/paper-colour sheet with no icon or text
- tab page → tab UI
- true missing image/fallback → placeholder icon

That directly fixes the “Page 4” icon problem.

### C. Make the outer page shell role-aware, not URL-aware
Still in `FlipBook.tsx`, determine page styling from `pageRole` first:
- material roles (`pvc_*`, `*_cover_card`) → no paper border/shadow
- blank paper roles (`blank_back`, `inside_back_blank`) → normal paper shell, but blank content
- printed pages → normal paper shell

This removes the current ambiguity where a page without a thumbnail can accidentally look like a broken asset instead of a deliberate blank sheet.

### D. Make bleed logic depend on real page roles
In `PageEffects.tsx`, compute bleed scope using explicit roles instead of only `isFrontCover`:
- `front_cover` should respect front-cover bleed
- if later you add a printed back cover role, it can participate in `covers`
- material sheets (`pvc_*`, card backs) should bypass paper bleed entirely
- `blank_back` should behave like paper, usually with normal margins/background

This should stop the white border logic from drifting between physical-material pages and paper pages.

### E. Tighten physical-sequence construction in one place
In `PreviewPanel.tsx`, keep the sequence builder as the single source of truth:
```text
[pvc_cover_front?]
[pvc_cover_back?]
[front_cover]
[blank_back if simplex]
[body pages with blank backs where simplex]
[inside_back_blank if needed for parity]
[inside_back_cover_card?]
[back_cover_card?]
```

Also ensure the role array is built alongside the page array, not inferred later from index defaults. That will prevent “role drift” after option changes.

### F. Update the page info display to use visible roles
Still in `PreviewPanel.tsx`, derive label/status from the visible physical faces:
- if visible face is `blank_back`, still show it as part of the front-cover section if it belongs to that simplex sheet
- if visible face is `inside_back_cover_card`, show the back-cover section label correctly
- avoid relying only on `currentPage + 1`

This will make the preview text match the actual physical book structure.

## Files to update
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`
- `src/components/preview/previewTypes.ts` (optional, to document the expanded role vocabulary)

## Expected result
- the back of a simplex cover renders as a plain blank white sheet, not an icon page
- the inside navy/black card back renders edge-to-edge consistently, without stray white borders
- changing front/back cover options repeatedly no longer knocks the margin logic out of alignment
- page/spread info better reflects the real physical document the customer will receive
