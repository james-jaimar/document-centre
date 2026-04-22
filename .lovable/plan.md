
## Rework ring binder preview as a dedicated single-sheet binder viewer

### What’s broken now

The current ring binder implementation is fighting the generic wire-bound `FlipBook` model, which is why it looks wrong:

- The **binder photo is being stretched from the page stage**, so the background gets squashed.
- The preview still behaves like a **two-page spread**, but the ring binder reference behaves like a **single loose sheet mounted on the right side of an open binder**.
- The generic bound-document logic assumes **spread navigation (`step=2`) and solo cover states**, which is why the **page numbering and page progression drift out of sync**.
- The current ring overlay is just a clipped strip on top of a spread, instead of a layout where the page is actually **anchored to the binder’s right-hand sheet area**.

### New approach

Stop forcing ring binders through the normal spread-based `FlipBook` layout.

Instead, build a **dedicated `RingBinderFlipBook`** that still uses the same `react-pageflip` animation engine, but with a binder-specific layout model:

1. **Closed state for the cover**
   - Render the closed binder photo at its **natural aspect ratio**.
   - Place the cover sheet flat in the PVC pocket area.
   - No mini spread, no centered flipbook stage.

2. **Open state for body pages**
   - Render the open binder photo at its **natural aspect ratio**.
   - Keep the **left side as the binder interior**.
   - Mount the page-flip stage only in the **right-hand printable sheet area**.
   - Keep the **ring strip centered and fixed** so pages flip against it cleanly.

3. **Single-sheet navigation**
   - Ring binders should advance **one printable face at a time**, not two.
   - Cover sheet = first state.
   - Then each body page flips individually inside the open binder.

### Implementation

#### 1) Add a dedicated ring binder preview component
Create a new component, e.g. `src/components/preview/RingBinderFlipBook.tsx`, that:

- uses `react-pageflip`
- reuses existing page rendering/effects logic where possible
- measures the binder viewport from the **asset aspect ratio**, not from spread width
- defines binder-specific rectangles:
  - closed pocket area
  - open right-page area
  - ring/spine strip
- renders:
  - **closed binder + cover sheet** for index 0
  - **open binder + right-side flipping page** for the rest

#### 2) Route ring binders away from the generic FlipBook
Update `src/components/preview/DocumentPreview.tsx` so:

- `ring_binder` renders `RingBinderFlipBook`
- other bound products still render the existing `FlipBook`

This isolates ring binder behavior instead of continuing to overload the generic bound preview.

#### 3) Remove the current ring-specific hacks from `FlipBook`
Refactor `src/components/preview/FlipBook.tsx` to remove the current `bindingType === "ring"` backdrop/stretch logic.

That code is the source of the squashed background and bad geometry. `FlipBook` should go back to being the clean spread-based renderer for wire/comb/saddle/perfect only.

#### 4) Fix preview navigation and page text for ring binders
Update `src/components/order/PreviewPanel.tsx` so ring binders use a **single-face progression model**:

- navigation step = `1` for ring binders
- page info text should read from `faceLabels` / `displayPageNumbers`
- cover sheet should display as **Cover Sheet**
- body pages should display as `Page N`
- no spread-style label formatting (`Left – Right`) for ring binders

#### 5) Fix fullscreen/lightbox navigation
Update `src/components/order/PreviewLightbox.tsx` so ring binders:

- also move by `1`, not `2`
- show the correct bottom counter/label for single-sheet navigation
- stay in sync with the main preview

#### 6) Keep the existing ring-binder section model
Preserve the product logic already introduced:

- optional **Cover Sheet**
- no wraparound front/back cover model
- body pages remain separate from the slip-in cover sheet

If needed, only make small adjustments so the preview sequence remains:
```text
Closed binder with Cover Sheet
→ Open binder with body page 1
→ Open binder with body page 2
→ Open binder with body page 3
...
```

### Files to change

| File | Change |
|---|---|
| `src/components/preview/DocumentPreview.tsx` | Route `ring_binder` to a dedicated component |
| `src/components/preview/RingBinderFlipBook.tsx` | New dedicated binder-specific animated preview |
| `src/components/preview/FlipBook.tsx` | Remove the current ring-specific backdrop/stretch implementation |
| `src/components/order/PreviewPanel.tsx` | Fix step, page info, and single-sheet ring binder behavior |
| `src/components/order/PreviewLightbox.tsx` | Fix fullscreen navigation/counting for ring binders |

### Result

Ring binders will preview correctly as:

- a **flat closed front cover** in the PVC pocket
- then an **open binder** with the page flipping on the **right-hand side**
- with the **original binder image kept in proportion**
- the **ring gap aligned properly**
- and **page numbering/navigation working normally again**
