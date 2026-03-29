
## Fix the FlipBook so solo cover pages are truly solo and still show the binding

### What’s actually going wrong

The current implementation is mixing two different models:

1. `react-pageflip`’s native `showCover` behavior, where the **first and last pages are already treated as single-page cover states**
2. Our own custom page sequencing/centering logic, where we also insert extra physical states like `inside_back_blank` and then translate the whole book

That combination is producing the “ghost” opposite page and hiding the binding at the exact moments where Mimeo keeps it visible.

From the docs, `showCover={true}` means:
- first page = solo cover
- last page = solo cover
- those endpoints should be the true outer materials of the book

Right now our data model does not line up with that rule.

---

## Implementation approach

### 1. Rebuild the bound-page sequence around physical outer materials
Update `src/components/order/PreviewPanel.tsx` so the sequence matches a real bound book:

```text
[front cover][inside pages/body/tabs...][inside back blank if needed][back cover]
```

Key changes:
- keep `front_cover` as the first page
- keep `back_cover_card` as the final page only when selected
- only insert `inside_back_blank` when required as a real interior page
- stop using page count tricks to “help” the flip library

This ensures the library’s first/last page logic corresponds to the actual object.

### 2. Stop treating the binding as “not visible on solo pages”
Update `src/components/preview/FlipBook.tsx` so the binding is not hidden just because the current state is solo.

Instead:
- show the binding for bound products on both spread and solo states
- switch asset/open-state as needed, but keep it visible
- position it relative to the actual rendered single page / spread center so it matches Mimeo

Right now this line is part of the bug:
- binding is rendered only when `!isSoloPage`

That should change.

### 3. Replace generic centering with role-aware centering
Keep `showCover={true}`, but rework the centering math in `FlipBook.tsx` so it is based on the actual current role:

- `front_cover` → center the visible right-hand page
- `back_cover_card` → center the visible left-hand page
- middle states → center the full spread

Also remove any leftover logic that assumes “solo = hide one side visually” rather than “solo = let the library render it natively and shift the book container”.

### 4. Fix page/spread navigation math in `PreviewPanel.tsx`
The preview controls and labels need to reflect the real physical sequence, not simple `currentPage + 1` assumptions.

Adjust:
- visible left/right page calculations
- page info text
- section/colour/duplex badges
- `goPrev`, `goNext`, `goLast`
- slider interpretation for bound mode

Goal:
- front cover reports correctly as a single page
- interior spreads report as two pages
- back cover reports as the final solo material
- no fake blank right-side state at the end

### 5. Tighten spine sizing/alignment
Update `src/components/preview/BindingSpine.tsx` and its placement in `FlipBook.tsx` so the spine:
- spans full rendered page height
- remains vertically centered
- is not clipped by wrappers/shadows/transforms
- aligns to the book hinge in both solo and spread states

---

## Files to update

1. `src/components/order/PreviewPanel.tsx`
2. `src/components/preview/FlipBook.tsx`
3. `src/components/preview/BindingSpine.tsx`
4. `src/components/preview/previewTypes.ts` (if a clearer page-role/page-mode type is needed)

---

## Technical details

### Root cause in current code
- `PreviewPanel.tsx` appends `inside_back_blank` and optional `back_cover_card`
- `FlipBook.tsx` assumes solo states from `displayPage`
- `FlipBook.tsx` hides the spine during solo states
- footer/page-number logic is still spread-oriented instead of role-oriented

### Library behavior to align with
Per `react-pageflip` docs:
- `showCover={true}` marks the **first and last pages** as hard covers
- those pages are shown in **single page mode**
- the correct solution is to make the first/last items in our sequence be the real outer materials, then shift the container for Mimeo-style centering

### Expected result after the fix
- front cover = one centered page, binding visible
- middle spreads = two pages, binding visible
- back cover = one centered page, binding visible
- no extra opposite white page
- no placeholder/ghost page
- no truncated or missing spine
