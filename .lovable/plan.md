
What I found

- The “only two panels visible” problem is a real geometry bug in the renderer, not the fold selector.
- `FoldPreview.tsx` is already slicing tri-fold and z-fold surfaces into 3 panels using `FOLD_GEOMETRY`, so the missing third panel is not coming from the crop step.
- The actual break is in `FoldNode.tsx` / `BrochureStage.tsx`: the left-side chain is positioned in a zero-width wrapper, so the left panel overlaps the centre panel instead of sitting to its left. That is why the open tri-fold / z-fold looks like only about two-thirds of the sheet.
- `brochure-specs.ts` still gives tri-fold and z-fold no real `insideStates` beyond `Open`, so the “flip to inside, then fold right panel in, then left panel in” behaviour literally does not exist yet.
- The current model is still too outside-centric: it treats fold progression and viewing side as if they were the same thing.

What I will change

1. Fix the 3-panel stage layout first
- Rework the hinge tree layout so left-side panels are placed physically to the left of the root, not on top of it.
- Keep the open state spanning the full sheet width, so tri-fold and z-fold show all 3 panels flat across the stage.

2. Define real fold sequences for tri-fold and z-fold
- Tri-fold (C-fold):
  - Outside: Open → right flap folds in → left flap folds over
  - Inside: Open → visible right panel folds in → visible left panel folds in
- Z-fold:
  - Open must still show 3 panels
  - Fold 1 and Fold 2 must alternate hinge direction, so it behaves differently from tri-fold instead of collapsing like another C-fold
  - Inside gets its own mirrored state sequence as viewed after turning the sheet over

3. Make inside folding a first-class model
- Add proper `insideStates` for tri-fold and z-fold instead of just `Open`
- Keep “surface” (outside/inside) separate from “progress” (open/fold 1/closed)
- Reset to the correct step when switching surfaces so the viewer never reuses an invalid outside-only state

4. Fix fold-specific panel mapping
- Keep outside slices mapped left-to-right
- Remap inside slices to the correct physical panels for each fold type, so the panel that folds from the right on the inside is actually the right inside panel
- Preserve the now-working half-fold logic

5. Keep the controls aligned with the physical action
- Tri-fold / z-fold controls should move through real fold steps, not just generic previous/next labels
- Closed/back views stay as views of the folded object, not separate fake fold states

Files to update

- `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/brochure/BrochureStage.tsx`
- `src/components/preview/brochure/brochure-specs.ts`
- `src/components/preview/brochure/brochure-types.ts`
- `src/components/preview/FoldPreview.tsx`
- `src/components/preview/brochure/BrochureViewer.tsx`
- `src/components/preview/brochure/BrochureControls.tsx`

Expected result

- Tri-fold and z-fold open views show 3 full panels, not 2 overlapping ones
- Outside folding works in two steps
- Inside folding works in two steps, with the visible motion happening from right first, then left, as you described
- Z-fold behaves differently from tri-fold
- Half-fold stays correct
