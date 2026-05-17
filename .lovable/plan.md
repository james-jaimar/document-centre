## What I found

The previous fix aimed in the right direction, but it does not match how the current upload data is actually shaped.

For the latest booklet test, the live database shows:

```text
front_cover -> 1-page PDF, simplex
body        -> 8-page PDF, duplex
back_cover  -> 1-page PDF, simplex
```

The failure is in the preview/sequence logic:

- `PreviewPanel` and `buildPreviewSnapshot` are currently using the whole linked document for each section.
- They also force saddle-stitched booklets to behave as duplex globally, so the existing simplex-cover blank insertion is too weak and easy to bypass.
- The “two pages at the end to make it a 12-pager” is the booklet padding rule working, but it is not specifically representing `[front][blank]` and `[blank][back]`.
- On the server side, the print-ready assembler honours `merge_directives` only if it can resolve section IDs to document paths. That path is fragile because the production job currently looks up documents by `job_id`, while the uploaded docs are attached to `order_item_id` at checkout time.

## Plan

1. **Fix the live preview page sequence**
   - Update `src/components/order/PreviewPanel.tsx` so cover sections are handled explicitly:
     - `front_cover` with a 1-page/simplex PDF emits: cover page, then blank page.
     - `back_cover` with a 1-page/simplex PDF emits: blank page, then back cover page.
   - Keep the existing 4-page multiple padding, but only after the cover blanks are in their correct physical positions.
   - Avoid adding normal simplex `blank_back` pages to saddle-stitched body pages, so the body remains correctly duplexed.

2. **Fix the placed-order preview snapshot**
   - Apply the same explicit cover-face sequence in `src/lib/orders/buildPreviewSnapshot.ts` so admin/customer order detail previews match the live builder.

3. **Make print-ready assembly resolve the real uploaded documents**
   - Update `pdf-server/app/services/production_orchestrator.py` so `load_job_bundle()` does not rely only on `documents.job_id`.
   - Resolve source documents via the job’s source `order_item_id` / matching order item, using `document_sections.document_id` as the authoritative map.
   - This ensures `configuration.merge_directives` can actually map `front_cover`, `body`, and `back_cover` sections to their PDFs.

4. **Keep merge directives as the production contract**
   - Leave `src/lib/orders/buildJobSnapshot.ts`’s directive order as the source of truth:
     - front cover section
     - blank page
     - body section
     - blank page
     - back cover section
   - Tighten comments/tests around that behaviour rather than inventing a second mechanism.

5. **Add focused regression coverage**
   - Add/adjust a lightweight test around the TypeScript sequence logic for a saddle-stitched booklet with:
     - 1-page front cover
     - 8-page body
     - 1-page back cover
   - Expected physical sequence:

```text
front_cover, blank_back, body x8, blank_back, back_cover
```

   - Final page count should be 12 without moving those cover blanks to the end.

## Out of scope

- Changing pricing.
- Changing imposition logic itself.
- Changing how two-page/duplex cover PDFs work.
- Changing brochures/flyers/business cards.