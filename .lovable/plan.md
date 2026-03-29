
Fix the preview by removing the conflicting “fake material” shortcuts and making the flipbook render one deterministic physical face per slot.

## What I found

### 1. The clear/frosted PVC front bug has a concrete root cause
In `FlipBook.tsx`, this logic is wrong:

```ts
const isMaterial = pageRole === "back_cover_card" || pageRole === "inside_back_cover_card" || pageRole === "pvc_cover_front" || pageRole === "pvc_cover_back";
...
} else if (isMaterial || isBlankPaper) {
  content = null;
}
```

That means `pvc_cover_front` never receives its image content at all. So the static page cannot show the printed cover through the PVC. The reason it seems to “work on hover” is almost certainly that the pageflip animation is revealing the next physical page underneath, not because the PVC page itself is rendering correctly.

So yes: earlier logic is still overriding the newer intent.

### 2. The margin drift is likely coming from page content scaling, not just border styling
The current preview uses:
- `object-cover` for `pvc_cover_front`
- `object-contain` for standard pages
- `padding: "3%"` only on some roles
- special casing for blank/material pages
- forced remounts via `bookKey`

That creates multiple rendering paths for page content, and they do not share one consistent “printable area” box. When users change options repeatedly, the library remounts cleanly, but the page content still lands in different layout models depending on role. That is why the borders look like they jump rather than simply turn on/off.

### 3. The preview is mixing two concepts that should be separated
Right now the code partially treats a page as:
- a physical sheet face
- a visual material effect
- a thumbnail image container

Those should be separate concerns. At the moment they are coupled in `FlipBook.tsx`, so some roles accidentally suppress content while others apply different fit rules. That is the architectural conflict causing these repeated regressions.

### 4. The library docs support a cleaner approach
The `react-pageflip` / StPageFlip docs indicate the component works by loading/updating HTML page elements, and it is very sensitive to DOM structure at mount/update time. Best practice here is to keep each page DOM simple and stable, rather than switching between materially different internal structures based on scattered conditions.

## Implementation plan

### 1. Fix the immediate PVC front rendering bug
In `src/components/preview/FlipBook.tsx`:
- stop treating `pvc_cover_front` as a null-content material page
- only true non-image faces should render `content = null`:
  - `pvc_cover_back`
  - `inside_back_cover_card`
  - `back_cover_card`
  - intentional blanks
- `pvc_cover_front` must always render the front artwork image

This should fix the “opaque until hover” issue at the real source.

### 2. Introduce one shared printable-area wrapper in `PageEffects`
Refactor `src/components/preview/PageEffects.tsx` so standard paper pages and printed cover pages use one consistent internal layout:
- outer page shell
- inner printable area
- optional bleed padding
- image/content rendered inside that same box every time

That removes the current split where some pages are laid out by image fit rules and others by wrapper logic.

### 3. Stop using different image fit strategies unless physically required
In `FlipBook.tsx`, simplify image rendering:
- standard printed pages and printed front cover should use the same fit model
- only PVC/card material-only faces should bypass image rendering
- do not use `object-cover` just for `pvc_cover_front` unless the physical trim model explicitly requires cropping

Right now this is a strong candidate for the asymmetrical “margin jump” effect.

### 4. Make `PageEffects` the single source of truth for white-edge logic
In `PageEffects.tsx`:
- centralize all bleed/no-bleed spacing there
- ensure material pages never inherit paper spacing
- ensure blank backs use the same paper shell as regular paper pages
- keep card covers edge-to-edge with no paper inset path at all

The goal is: one function decides margins, once.

### 5. Tighten physical role semantics in `PreviewPanel`
In `src/components/order/PreviewPanel.tsx`:
- keep generating explicit physical roles
- verify that every inserted page role maps to exactly one render path
- avoid any fallback where a physical face becomes generic `body` unless that is truly intended

This prevents future regressions where a new role accidentally falls into the wrong visual branch.

### 6. Reduce flipbook state ambiguity
In `FlipBook.tsx`:
- keep the deterministic `bookKey`
- but make sure page DOM for each role is structurally stable across option changes
- avoid “same role, different DOM tree shape” behavior where possible

That aligns better with how `react-pageflip` expects HTML pages to behave.

## Files to update
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`
- `src/components/order/PreviewPanel.tsx`

## Expected result
- clear/frosted PVC front is visibly translucent at rest, not only during hover/turn
- the printed front artwork is always present on the PVC front face
- white margins stop “jumping” because all printed pages use one consistent printable-area layout
- blank simplex backs remain plain paper
- inside back card and outer back card stay fully edge-to-edge
- repeated option changes remain visually stable because each physical role has one deterministic render path

## Technical notes
Root-cause bug identified:
```ts
// Current bug in FlipBook.tsx
const isMaterial = ... || pageRole === "pvc_cover_front";
...
else if (isMaterial || isBlankPaper) {
  content = null; // drops the PVC front artwork entirely
}
```

This is the first thing to remove, because it proves the latest intended behavior is currently being bypassed by earlier branching logic.
