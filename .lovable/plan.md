
## Fix ring binder preview to follow the actual product model

### What the preview should model

A ring binder is not a normal bound document.

- The binder itself is hardware, not a printed cover
- The clear front pocket may show an optional uploaded **Cover Sheet**
- If no cover sheet was uploaded, the closed binder may show the **first body page through the window**, but that must **not** become a real inserted page in the sequence
- Inside pages are still physical sheets:
  - simplex = printed front + blank reverse
  - tabs/inserts behave like physical divider sheets
- Open binder navigation must follow the agreed static model:
  - first active sheet starts on the **right**
  - turned/completed sheets accumulate on the **left**

### Root cause

The current ring binder flow is mixing two different ideas:

1. **Closed binder display**
   - `RingBinderOpenSpread.tsx` uses `urls[0]` for the front pocket artwork whenever page 0 is shown
   - if there is no real `front_cover` section, that means the first body page is being visually treated like a cover

2. **Underlying physical sequence**
   - the first body page is still also part of the inside sequence
   - so the preview ends up visually “using” page 1 twice:
     - once as a fake cover sheet
     - again as part of the body stack
   - that is why inside numbering/drift becomes wrong

### Implementation plan

#### 1. Separate “front pocket display” from the actual page sequence
Update the ring binder renderer so the closed-binder pocket artwork is derived from:

- real uploaded `front_cover` section first
- otherwise first body page as a **display-only fallback**
- but without mutating the page sequence or consuming a body index

This keeps the closed front visual nice without creating a fake cover page.

#### 2. Make ring binders use an explicit ring-binder page model
Keep the shared bound-document sequence logic intact for other products, but add ring-binder-specific interpretation on top of it:

- treat body pages, blank backs, tabs, and inserts as real physical faces
- do not auto-create any front cover face for ring binders unless a real `front_cover` section exists
- do not treat the binder hardware/back panel as a content face

#### 3. Correct the open-spread mapping for the ring binder
Rework `RingBinderOpenSpread.tsx` so the static open state follows the agreed physical behaviour:

- closed state = binder front
- open state = first active printed sheet starts on the **right**
- left side represents the turned/completed stack
- blank backs for simplex pages remain part of the physical model
- tabs/inserts stay aligned to the right-hand insertion flow

This will likely require recalculating which sequence indices feed the left and right panes instead of using the current generic spread pairing.

#### 4. Fix page numbering so the cover window does not count as an inserted page
Update the ring binder numbering/display text so:

- if no real cover sheet exists, page numbering starts from the first body page
- the closed front pocket view does not shift the internal page count
- inside view labels stay aligned with the actual body/document sequence

#### 5. Mirror the same logic in saved order previews
Apply the same ring-binder rules in `buildPreviewSnapshot.ts` so placed-order previews behave exactly like the live configurator.

### Files to update

| File | Change |
|---|---|
| `src/components/preview/RingBinderOpenSpread.tsx` | Split closed-pocket display from real sequence, remap open spread to right-first ring-binder logic |
| `src/components/order/PreviewPanel.tsx` | Adjust ring-binder page info / numbering / visible-page logic so no fake front cover is counted |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror the same ring-binder sequencing and numbering rules for saved previews |

### Guardrails

- Do not modify `FlipBook.tsx` or shared bound-document behaviour
- Keep ring-binder-specific logic isolated to the ring binder path
- After implementation, verify wire/comb/perfect/saddle previews still behave exactly as before

### Expected result

- No auto-inserted front cover when the user only assigned body pages
- Closed binder can still show artwork in the pocket without corrupting the sequence
- Inside page numbering matches the real body pages
- Simplex sheets remain front + blank back
- Tabs/inserts continue to work as physical divider sheets
- Ring binder behaviour matches the real-world product instead of the generic book model
