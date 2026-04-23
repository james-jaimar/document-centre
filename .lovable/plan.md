
## Rebuild ring binder preview around the real physical model

### What is actually wrong

The current ring binder logic is still half-thinking like a book.

There are three separate problems in the code right now:

1. `PreviewPanel.tsx` and `buildPreviewSnapshot.ts` are prepending fake binder faces (`binder_closed`, `binder_left_blank`) into the actual page sequence
   - that makes the closed hardware state behave like real pages
   - that is why numbering, labels, and simplex backs drift

2. `RingBinderOpenSpread.tsx` is rendering “missing” faces as white paper placeholders
   - so the last state shows a fake blank page on the right
   - physically that should be binder hardware / empty side, not a sheet

3. Ring binder navigation is stepping like a spreaded book
   - but a ring binder should advance one physical face at a time once opened
   - first open = page starts on the right
   - each next step moves that face over the rings to the left and reveals the next face on the right
   - final step = last face sits on the left, right side is empty hardware

### Correct ring binder model

A ring binder preview should use:

- **Closed state**
  - hardware only
  - front pocket may display:
    - real uploaded `front_cover` face first
    - otherwise first real content face as display-only fallback
  - this display must never become part of the physical sequence

- **Physical sequence**
  - only real inserted faces:
    - `front_cover` if actually uploaded
    - `body`
    - `blank_back` for simplex
    - `tab` / `tab_back`
    - `insert` / `insert_back`
  - no `binder_closed`
  - no `binder_left_blank`

- **Open navigation**
  - `view 0` = closed binder
  - `view 1` = left hardware, right first physical face
  - `view 2` = left previous face, right next face
  - ...
  - final view = left last physical face, right hardware

### Implementation plan

#### 1. Remove fake binder pages from the sequence layer
Update both:

- `src/components/order/PreviewPanel.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`

So ring binders no longer prepend:

- `binder_closed`
- `binder_left_blank`

The sequence must remain a pure list of real inserted faces only.

Keep:
- simplex `blank_back`
- tabs/inserts as physical sheets
- ring binder bleed suppression for body pages
- no printed back-cover card for ring binders

#### 2. Replace raw page-index navigation with a ring-binder view model
In `PreviewPanel.tsx`, stop treating ring binder navigation as raw page indices.

Introduce a ring-binder-specific view count:

- `view 0` = closed
- `view 1..N+1` = open turns across the real sequence of `N` physical faces

Use this mapping:

```text
turn = viewIndex - 1

if viewIndex === 0:
  closed view

else:
  leftFace  = turn === 0 ? hardware-left : sequence[turn - 1]
  rightFace = turn < sequence.length ? sequence[turn] : hardware-right
```

This fixes all four symptoms at once:

- no auto-inserted cover
- correct first open state
- correct simplex backs
- correct final empty-right state

#### 3. Rework `RingBinderOpenSpread.tsx` to render hardware states explicitly
Update the component so it stops assuming every pane is a paper face.

Add explicit rendering modes for each side:

- `sheet`
- `hardware-left`
- `hardware-right`

Rules:

- closed view: use pocket artwork only for display
- first open view: left hardware panel, right first physical face
- middle views: left previous face, right next face
- final view: left last physical face, right hardware only

Critically:
- do not render a white paper placeholder when the right side is past the end
- let the binder artwork remain visible there instead

#### 4. Fix numbering/footer labels from the new view model
Update `pageInfoText`, section labels, and visible-face metadata in `PreviewPanel.tsx` so labels come from the mapped left/right physical faces, not from fake prepended roles.

Expected behaviour:

- closed = `Ring Binder (Closed)`
- first open with no real cover = first body page starts as Page 1 on the right
- no “Front Cover” badge unless there is an actual uploaded front-cover section
- last view shows only the last physical face as the active labelled face
- hardware states do not count as pages

#### 5. Fix ring binder navigation in fullscreen too
Update `src/components/order/PreviewLightbox.tsx` so ring binders no longer use the shared `step = 2` bound-document rule.

The lightbox must use the same ring-binder view model as the inline preview, otherwise fullscreen and inline will disagree again.

#### 6. Mirror the same sequence rules into saved order previews
Update `buildPreviewSnapshot.ts` so persisted previews store only the real physical ring-binder faces.

The saved preview should not contain any fake binder roles either. The viewer should reconstruct closed/open hardware states at render time, not from snapshot data.

### Files to update

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | Remove fake binder roles from sequence, add ring-binder view indexing, fix page info/footer/slider logic |
| `src/components/preview/RingBinderOpenSpread.tsx` | Render hardware-left/hardware-right explicitly, use display-only pocket fallback, remove fake white right page at end |
| `src/components/order/PreviewLightbox.tsx` | Give ring binders their own navigation model instead of shared bound-doc stepping |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror the real physical sequence only; no binder virtual pages in persisted preview data |

### Guardrails

- Do not touch `FlipBook.tsx`
- Keep ring binder logic isolated to the ring binder path
- Do not reintroduce any fake binder roles into the physical page sequence
- Treat the binder hardware as viewer state, not document content

### Verification checklist

Test these cases after implementation:

1. **No cover + simplex body pages**
   - closed pocket may show first body page
   - first open shows left hardware / right Page 1
   - next open shows left Blank Back / right Page 2

2. **No cover + last page**
   - final state shows last face on the left
   - right side is hardware only, not a blank paper page

3. **Real uploaded front cover**
   - closed pocket shows real front cover
   - inside numbering remains correct
   - front cover only appears if actually uploaded

4. **Tabs and inserts**
   - still start on the right
   - never split across the binder

5. **Fullscreen**
   - same order, same labels, same end-state as inline preview

6. **Regression check**
   - wire / comb / perfect / saddle unchanged

### Expected result

- No auto-inserted front cover when only body pages were assigned
- Closed binder can still show artwork in the window without corrupting numbering
- Ring binder advances like a real turned-sheet model, not a book spread model
- First open starts on the right
- Final state shows the last turned page on the left and hardware on the right
- No zoom/layout drift between open states because the open binder geometry stays fixed
