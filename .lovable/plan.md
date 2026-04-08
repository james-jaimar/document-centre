
Yes — it makes sense. The current preview is close, but it is still mixing up three different ideas:
1. which surface of the sheet we are looking at (outside vs inside),
2. which panel is actually visible when a fold is closed,
3. how different fold types hinge and stack.

## Why it is still wrong

- `src/components/preview/FoldPreview.tsx` slices the sheet, then reverses the inside array unconditionally. For a half-fold that is wrong: the inside spread is already `[left panel | right panel]`, so reversing it swaps the two A5 inside panels.
- `src/components/preview/FoldPreview.tsx` only assigns artwork to `panel.front`; `panel.back` is empty. Any fold state that exposes a reverse face shows blank (`p2 back`).
- `src/components/preview/brochure/BrochureStage.tsx` always builds the fold tree from the leftmost panel as the fixed root. That means the engine can only collapse toward the left, which is why half-fold closed cannot naturally show the front cover first.
- `src/components/preview/brochure/FoldNode.tsx` ignores `hinge.direction`, so tri-fold C, Z-fold, and gate-fold do not get distinct mechanics.
- The viewer state is too generic and not reset/remapped for fold-specific closed views, so changing fold type can appear to do nothing or land in the wrong state.

## Physical model to implement

### Half-fold
- Open outside = back cover | front cover
- Open inside = inside left | inside right
- Closed front = front cover only
- Closed back = back cover only
- There is no meaningful “closed inside” state

### Tri-fold C
- Open outside = back cover | outer flap | front cover
- Open inside = inside left | inside centre | inside right
- Intermediate fold closes the flap first
- Final closed view needs separate front-cover and back-cover views

### Z-fold
- 3 panels with alternating hinge directions
- Open inside/outside stay 3-up, but the fold sequence differs from C-fold

### Gate-fold
- Closed front shows the two gates meeting in the middle
- It should not be forced into a half-fold-style single-cover closed state

## Plan

### 1. Rebuild brochure panel mapping around physical faces
File: `src/components/preview/FoldPreview.tsx`

- Slice outside and inside surfaces once per fold type using the configured width fractions.
- For half-fold inside, crop exactly:
  - left panel = left 50%
  - right panel = right 50%
- Remove the blanket inside reversal.
- Make inside/outside panel order an explicit per-fold mapping instead of hardcoded reversal.
- Populate both `front` and `back` artwork for each panel so reverse faces are never blank.

### 2. Make fold specs explicit per fold type
Files: `src/components/preview/brochure/brochure-specs.ts`, `src/components/preview/brochure/brochure-types.ts`

- Replace the current generic states with physically correct states per fold type.
- Add explicit closed-front / closed-back states where that makes sense.
- Store hinge direction plus any needed “which panel stays visible when closed” metadata in the spec.

### 3. Fix the 3D engine so non-half-folds actually behave differently
Files: `src/components/preview/brochure/BrochureStage.tsx`, `src/components/preview/brochure/FoldNode.tsx`

- Stop assuming panel 0 is always the fixed/root panel.
- Respect hinge direction (`inward` / `outward`) when building transforms.
- Allow the closed state to anchor on the correct visible cover panel, so half-fold closed outside shows the front cover first.
- Fix stacking/z-index so the correct flap sits on top during folds.

### 4. Separate sheet side from cover side in the controls
Files: `src/components/preview/brochure/BrochureViewer.tsx`, `src/components/preview/brochure/BrochureControls.tsx`

- Keep “Show Outside / Show Inside” for the sheet surface.
- Add a separate closed cover view when applicable:
  - Front cover
  - Back cover
- For half-fold, the end result should let the user move between:
  - Open outside
  - Front cover
  - Back cover
  - Open inside
- Reset the active state whenever `foldType` changes so switching fold type immediately updates the preview.

### 5. Add fold-type validation
Relevant flow: fold preview input / viewer state

- If the selected fold type expects a different panel count than the uploaded brochure layout provides, show a clear mismatch message instead of rendering a misleading fold.
- This prevents “changing fold type does nothing” when the source artwork layout and selected fold type do not match.

## Files to change

- `src/components/preview/FoldPreview.tsx`
- `src/components/preview/brochure/brochure-specs.ts`
- `src/components/preview/brochure/brochure-types.ts`
- `src/components/preview/brochure/BrochureStage.tsx`
- `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/brochure/BrochureViewer.tsx`
- `src/components/preview/brochure/BrochureControls.tsx`

## Expected result

- Half-fold inside crops are correct.
- Closed outside defaults to the front cover.
- Back cover is available as a distinct closed view.
- Reverse faces no longer appear blank.
- Tri-fold, Z-fold, and gate-fold finally have visibly different mechanics instead of behaving like the same left-collapsing model.
- The preview uses more of the available space without breaking the physical logic.

## Technical note

This is not just a cropping fix. The real issue is the model:

- current code = one-sided images + left-rooted folds + ignored hinge directions
- needed code = two-sided panel faces + fold-specific hinge rules + explicit front/back closed views
