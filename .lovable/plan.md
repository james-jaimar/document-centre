
Roll/C-fold fix plan

What I found
- I should not touch `brochure-specs.ts` again for tri-fold: your current outside open view and outside folded default view are already correct.
- The remaining bugs come from two places:
  1. `BrochureStage.tsx` only sorts panels by coarse layer (`behind/base/front`), so in the inside view the left flap is not guaranteed to sit on top of the right flap when both are folded.
  2. `BrochureViewer.tsx` still uses whole-scene rotation to show the “other side” of a folded roll fold. That exposes `panel.back` (inside artwork), which is why `View Back` and folded `Show Outside` can show the wrong face.

Implementation
1. Fix tri-fold stacking in `src/components/preview/brochure/BrochureStage.tsx`
- Keep the current tri-fold angles.
- Change render ordering so same-layer folded panels are also sorted by fold depth / `foldSequence`.
- Result: inside view will correctly behave as “right folds first, left folds second, left sits on top”.

2. Add explicit closed-face mapping in `src/components/preview/brochure/BrochureViewer.tsx`
- Detect when `foldType === "tri_fold"` and all foldable panels are closed.
- Treat the closed roll-fold as a 2-face object instead of relying on rotated back-faces:
  - closed outside face = centre outside panel (`p1.front`)
  - opposite closed face = left outside panel (`p0.front`)
- When the user asks to see the opposite side of a fully closed brochure (`View Back`, or switching side while closed), show these explicit faces instead of rotating into inside artwork.

3. Preserve the closed state when switching outside/inside on a fully closed roll fold
- Special-case `handleToggleSurface` so a fully closed tri-fold stays closed when switching sides.
- Keep the current reset-to-open behavior for open or partially folded states.

Expected result
- Outside open: unchanged.
- Outside folded default: unchanged.
- Inside open: unchanged.
- Inside folded: right flap folds in first, left flap folds in second and ends up on top.
- Outside folded + `View Back`: shows the correct opposite closed face, not inside artwork.
- Inside fully folded + `Show Outside`: shows the correct closed outside face, not the wrong panel/face.

Files to update
- `src/components/preview/brochure/BrochureStage.tsx`
- `src/components/preview/brochure/BrochureViewer.tsx`
