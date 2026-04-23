
## Clean rewrite plan for ring binder preview

### What the actual problem is

The issue is not the ring binder itself. The issue is that the code is modelling it in three different ways at once:

1. `PreviewPanel.tsx` builds a physical face sequence
2. `RingBinderOpenSpread.tsx` interprets that sequence into a visual left/right view
3. `PreviewLightbox.tsx` and snapshot logic each apply their own navigation assumptions

Because those layers are not driven by one shared ring-binder model, the app keeps reintroducing the same bugs:
- fake cover behaviour
- wrong simplex/duplex stepping
- blank page appearing on the wrong side
- numbering drift
- zoom/layout shifting between views

### Key requirement to lock in

For ring binders only:

- If **no real cover sheet** was uploaded, the **closed binder front is blank**
- The binder hardware is **not** a page
- The inside preview starts with **Page 1 on the right**
- **Simplex** sequence:
  - open 1: left hardware, right Page 1
  - open 2: left Blank Back, right Page 2
  - open 3: left Blank Back, right Page 3
- **Duplex** sequence:
  - open 1: left hardware, right Page 1
  - open 2: left Page 2, right Page 3
  - open 3: left Page 4, right Page 5
- Final view:
  - last physical face on the left
  - hardware only on the right
  - never a fake white paper page on the right

## Rewrite strategy

### 1. Create one shared ring-binder model as the single source of truth
Add a dedicated helper for ring binders only, e.g. a new utility used by:
- `PreviewPanel.tsx`
- `PreviewLightbox.tsx`
- `RingBinderOpenSpread.tsx`
- `buildPreviewSnapshot.ts`

That helper will expose two layers:

#### A. Physical sequence
Real inserted faces only:
- `front_cover` only if actually uploaded
- `body`
- `blank_back` for simplex
- `tab` / `tab_back`
- `insert` / `insert_back`

No virtual binder pages.
No fake front cover.
No fake inside-left placeholder.

#### B. View model
A separate derived navigation model:
- `view 0` = closed binder
- `view 1` = left hardware, right face 0
- `view 2` = left face 0, right face 1
- ...
- `view N+1` = left last face, right hardware

This removes the current mismatch between sequence logic and UI logic.

### 2. Rewrite ring binder sequence generation from scratch
In `PreviewPanel.tsx` and `buildPreviewSnapshot.ts`:
- keep the existing physical rules for simplex blank backs
- keep tab/insert anchoring as physical sheets
- keep ring-binder bleed suppression for body pages
- keep “no printed back cover card” for ring binders
- remove any leftover role handling for:
  - `binder_closed`
  - `binder_left_blank`

For ring binders, the stored/rendered face list must be content only.

### 3. Rewrite `RingBinderOpenSpread.tsx` around explicit pane types
Stop treating every left/right slot as a paper face.

Each side should render one of:
- `hardware-left`
- `hardware-right`
- `sheet`

Rules:
- closed view:
  - binder front artwork
  - real uploaded `front_cover` in pocket if present
  - otherwise blank pocket/front
- first open:
  - left hardware
  - right first physical face
- middle views:
  - left previous physical face
  - right next physical face
- final view:
  - left last physical face
  - right hardware

Critically:
- no white fallback sheet when a side has no physical face
- hardware remains visible instead

### 4. Lock the open binder geometry so zoom never shifts
Use one fixed open-state frame calculation for every open ring-binder view:
- same binder background size
- same page box size
- same center gap
- same scaling target

Only the face content changes between views.
This removes the current zoom-out / zoom-in drift during navigation.

### 5. Move all ring-binder labels and numbering onto the view model
In `PreviewPanel.tsx`, compute labels from the mapped visible faces, not from raw indices.

Expected labels:
- closed: `Ring Binder (Closed)`
- no cover uploaded: no `Front Cover` label
- first open simplex: `Page 1`
- next simplex step: `Blank (Back) – Page 2`
- duplex steps: `Page 2 – Page 3`, etc.
- final step with right hardware: show only the left physical face label

Hardware states must never count as pages.

### 6. Make lightbox use the exact same ring-binder model
Update `PreviewLightbox.tsx` so it does not infer ring-binder totals separately.

It should use the same view count and next/prev rules as inline preview:
- closed = 0
- each click advances one physical face transition
- final view ends on left-last / right-hardware

Inline and fullscreen must be mathematically identical.

### 7. Persist only the physical sequence in saved previews
In `buildPreviewSnapshot.ts`:
- save only real ring-binder faces
- save roles/labels/numbers based on the physical sequence
- let the viewer reconstruct hardware states at render time

This keeps order-detail previews aligned with the configurator and avoids snapshot pollution from fake binder pages.

## Files to update

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | Remove ring-binder-specific patched navigation math and switch to shared ring-binder model |
| `src/components/preview/RingBinderOpenSpread.tsx` | Clean rewrite of renderer using explicit hardware/sheet pane types and fixed open geometry |
| `src/components/order/PreviewLightbox.tsx` | Reuse the same ring-binder view model as inline preview |
| `src/lib/orders/buildPreviewSnapshot.ts` | Persist only real faces and mirror the rewritten ring-binder sequence rules |
| `src/lib/...new helper...` | Add dedicated ring-binder sequence/view-model utility so logic lives in one place |

## Guardrails

- Do not touch `FlipBook.tsx`
- Do not put ring-binder logic into shared bound-document code
- Do not use body page 1 as a closed-front fallback when no cover exists
- Do not add virtual binder pages into the physical sequence
- Do not render blank white paper where hardware should be shown

## Verification checklist

1. **No cover + simplex**
   - closed front blank
   - first open: left hardware / right Page 1
   - next: left Blank Back / right Page 2
   - no repeated Page 1-on-left intermediate bug

2. **No cover + duplex**
   - closed front blank
   - first open: left hardware / right Page 1
   - next: left Page 2 / right Page 3

3. **Real cover uploaded**
   - closed front shows real cover sheet only
   - numbering inside remains correct
   - no auto-generated cover if none uploaded

4. **Last view**
   - left last physical face
   - right hardware only
   - no fake blank paper on right

5. **Tabs and inserts**
   - always enter on the right
   - never split across the spread

6. **Layout stability**
   - no zoom drift between open states

7. **Fullscreen**
   - same order, same labels, same end-state as inline preview

8. **Regression**
   - wire / comb / perfect / saddle unchanged

## Expected result

This rewrite replaces the current patch-on-patch behaviour with one dedicated ring-binder model. That will stop the repeated regressions because sequence building, numbering, labels, inline preview, fullscreen preview, and saved snapshots will all use the same physical rules.
