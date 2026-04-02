
Goal

Make brochure preview behave like a physical sheet:

- exactly one visible side at a time: Outside or Inside
- flat state = one full page image of that side
- folded state = same side split into fold panels and animated
- no rounded corners

What’s still wrong

1. `src/components/preview/FoldPreview.tsx` still renders panel slices even when unfolded. That still reads like multiple pages/panels instead of one single side.
2. The sheet box uses a hardcoded wide ratio instead of the real side ratio, which is why the artwork sits in only part of the preview and the rest looks like extra page space.
3. `tri_fold` and `z_fold` do not have clearly different real-world fold behavior yet.
4. `src/components/order/PreviewPanel.tsx` still contains fallback logic that can guess brochure surfaces from arbitrary documents, which is risky and confusing.

Best-practice model from brochure references

- Half-fold: 1 crease, 2 panels.
- Tri-fold / roll fold: 2 creases, 3 panels, folded in the same rolling direction.
- Z-fold / accordion: 2 creases, 3 panels, alternating fold directions.
- Gate-fold: side panels fold inward to a larger center panel.
- In all cases, the customer should first see one complete side of one sheet, not multiple pages.

Implementation

1. `src/components/order/PreviewPanel.tsx`
   - For fold products, build preview input strictly from assigned sections:
     - `front_cover` = Outside
     - `back_cover` = Inside
   - Use only the first thumbnail from each assigned section.
   - If only Outside exists, pass one surface and hide the inside toggle.
   - If no fold sections exist, show the brochure empty state instead of guessing from the first two docs.

2. `src/components/preview/DocumentPreview.tsx`
   - Normalize fold preview input into explicit brochure-side semantics before rendering:
     - outside surface
     - inside surface
     - actual sheet aspect ratio
   - Keep fold previews out of the generic page-array model.

3. `src/components/preview/FoldPreview.tsx`
   - Split rendering into two modes:
     - Unfolded: render one single full-side image with fold-guide overlays
     - Folded: render panel windows over that same side and animate them
   - Remove rounded corners entirely and keep square sheet edges.
   - Size the sheet from the actual aspect ratio instead of the current hardcoded wide box.
   - Keep only one outer sheet container in the flat state; no per-panel page/card appearance.

4. Fold mechanics
   - `bi_fold`: equal halves, single center fold.
   - `tri_fold`: real roll-fold motion, visually distinct from z-fold.
   - `z_fold`: equal-third accordion behavior with alternating fold directions.
   - `gate_fold`: narrower side gates folding into a larger center panel.
   - Back/Inside view must mirror correctly so the fold still feels physical from the reverse side.

5. Verification
   - Outside only: one square-corner sheet, no “Show Inside”.
   - Outside + Inside: toggle swaps complete side images, never a page-style preview.
   - Flat state never looks like two pages side by side.
   - Changing fold type visibly changes guides and folded animation.
   - No rounded corners on the sheet.
   - No standard page navigation UI for fold products.

Technical note

There is a related follow-up item in the upload flow: brochure image sizing should eventually use brochure/open-sheet sizes rather than generic ISO page sizes. That is separate from this immediate preview fix, but it should be aligned next for full accuracy.
