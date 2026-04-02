
Fix the brochure preview to use a sheet model instead of a page model.

What’s actually wrong
1. `src/components/order/PreviewPanel.tsx` still builds fold preview input from `documents.flatMap(thumbnail_urls)`. That treats uploaded thumbnails like normal pages, instead of using the sections the customer assigned as Outside and Inside.
2. `src/components/preview/FoldPreview.tsx` renders each fold panel as its own bordered/shadowed card. In the flat state this visually reads as “2 pages side by side” (or 3/4 cards), which is exactly the wrong mental model.
3. For brochures, the preview should represent one physical sheet with two surfaces:
   - Outside
   - Inside  
   Fold type should only change fold guides and animation, not create a multi-page look.

Best-practice behavior
- Bi-fold, tri-fold, Z-fold, and gate-fold are all one sheet.
- Customer sees one side at a time.
- Flat view = one continuous sheet.
- Folded view = animated panels of that same sheet.
- “Show Inside” switches surfaces, not pages.

Changes
1. `src/components/order/PreviewPanel.tsx`
   - Stop sourcing fold preview from all document thumbnails.
   - Build fold preview data from assigned sections only:
     - `front_cover` = outside
     - `back_cover` = inside
   - Use only the first thumbnail from each assigned brochure-side document.
   - Ignore unassigned docs and extra thumbnails for fold rendering.
   - Pass exactly 1–2 sheet surfaces in outside/inside order.

2. `src/components/preview/DocumentPreview.tsx`
   - Normalize fold input into explicit brochure-side semantics before rendering `FoldPreview`.
   - Prevent fold products from being treated like generic page arrays.

3. `src/components/preview/FoldPreview.tsx`
   - Redraw the unfolded state as one single sheet with one outer border/shadow.
   - Remove per-panel borders/shadows in the flat state.
   - Keep internal panels only for clipping and 3D transforms.
   - Overlay fold guides on the single sheet.
   - Keep Outside/Inside toggle only when an inside surface exists.
   - Ensure changing fold type visibly changes the geometry/guides/animation.

Technical detail
```text
Correct flat brochure preview:
┌──────────────────────────────────────┐
│          one continuous side         │
│      full artwork spans the sheet    │
│        with fold guide overlays      │
└──────────────────────────────────────┘

Wrong current impression:
┌──────┐ ┌──────┐
│page? │ │page? │
└──────┘ └──────┘
```

Notes
- This matches print reality: brochures are sheet-based, not page-turn based.
- If a brochure-side document has multiple pages, preview should use page 1 only for now; stricter validation can be added separately.
- The fold selector wiring in `OrderBuild.tsx` looks broadly correct; the bigger issue is the preview data model and the way the sheet is visually composed.

Implementation order
1. Fix `PreviewPanel` to map sections to Outside/Inside surfaces.
2. Normalize fold input in `DocumentPreview`.
3. Rework `FoldPreview` so unfolded = one sheet, folded = animated sheet panels.
