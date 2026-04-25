## Two related issues to fix

### 1. Single-page covers should be simplex (with a real blank inside)

Today, when a customer uploads a 1-page front cover the section defaults to `is_duplex = true`, so the preview's first spread shows the cover on the left and **body page 1 on the back of the cover** — wrong from a printer's perspective. Same for a 1-page back cover.

**Rule (per your answer):** A 1-page cover is always single-sided. The reverse face is a real blank sheet — present in both the preview AND the final merged PDF that goes to the print shop. A 2-page upload is treated as a duplex cover (face A = outside, face B = inside).

**Where to change it:**

- **`src/pages/dashboard/OrderFiles.tsx` → `handleAddAs`** — when the user drops a document into the Front Cover or Back Cover slot, set `is_duplex` based on the uploaded document's `page_count`:
  - `page_count === 1` → `is_duplex = false`
  - `page_count >= 2` → `is_duplex = true` (existing behaviour for brochures stays)
- **`src/components/order/SectionList.tsx` (the duplex toggle)** — for `front_cover` / `back_cover` sections backed by a 1-page document, lock the toggle to Simplex (or hide it) so the customer can't flip it back to duplex against physics. Show a small helper: *"Single-page covers are always single-sided. Upload a 2-page PDF for a printed inside cover."*
- **`src/lib/orders/buildJobSnapshot.ts`** — when generating the job ticket / merged-PDF directive for the print shop, if a cover section is `is_duplex = false` and is followed by another section, **insert a real blank page** in the merge sequence (NOT a synthetic `blank_back` placeholder — a genuine blank PDF page). Add this rule to `mem://features/order-flow/multi-document-merge-rules` so future code respects it.
- **Preview side** (`PreviewPanel.tsx` and `buildPreviewSnapshot.ts`) already emits a `blank_back` face for simplex sections — so once `is_duplex` is correct the spread layout self-corrects: cover on right (solo), then blank inside on the next left, then body page 1 on the right. No layout code change needed here.

### 2. Ghost grey "Page N" faces between and at the end of documents

The placeholders you're seeing (image 421 right page = "Page 33", image 422 = "Page 60") are body faces emitted with an empty `thumbnailUrl`. They render via the FlipBook fallback branch (`FileText` icon + grey "Page N"). Two root causes are in play:

**Root cause A — `pickBestPerPage` returns a dense array.**
In `src/lib/thumbnailUtils.ts`, `pickBestPerPage` builds `result` by iterating over the pages it actually found, not by page index. If page N's render failed/was skipped on the VPS, page N+1 silently slides into slot N, and the very last slot ends up empty. `buildPageSequence` then iterates `i < page_count` against a shorter thumbnails array → the missing tail becomes an empty-URL body face → grey ghost.

**Root cause B — render race / silent partial completion.**
`renderDocumentThumbnails` polls for derived files but bails early when `stalePolls >= 8 && found >= expectedPages * 0.8` (line 102 in `useDocumentUpload.ts`). On a slow render this can persist the document with `thumbnail_urls.length < page_count`.

**Fixes:**

- **`src/lib/thumbnailUtils.ts` → `pickBestPerPage`** — return a sparse-aware array sized to `max(page) + 1`, with empty strings in any gap so page N's image always lands at index N. Add a JSDoc note explaining the index-stable contract.
- **`src/hooks/useDocumentUpload.ts` → `renderDocumentThumbnails`** —
  - Pass `expectedPages` into `pickBestPerPage` so it always returns an array of length `expectedPages` (filling gaps with `""`).
  - Drop the `expectedPages * 0.8` early-exit. Always wait for the full count or the full poll budget. If we time out with gaps, log a `console.warn` listing the missing page indices and store the sparse array (so the UI degrades to a blank sheet, not a ghost).
  - After the upload finishes, if any thumbnail is missing, surface a small "Re-render previews" affordance on the document card (toast or inline) so the customer/operator can retry.
- **`src/components/preview/FlipBook.tsx`** — for body faces with empty `thumbnailUrl`, render them as plain white paper (re-use the `BLANK_PAPER_ROLES` style in `PageEffects.tsx`) instead of the `FileText` "Page N" placeholder. This is the safety net you described: "should appear to the user as just plain white". The grey FileText box stays only for the loading/spinner state during initial upload, never for steady-state previews.
- **`src/components/preview/PageEffects.tsx`** — extend `BLANK_PAPER_ROLES` (or a new branch) so body faces with no thumbnail also paint plain paper. They keep their page number in the sidebar but render visually as a clean blank sheet.

### 3. Memory updates

- Update `mem://features/order-flow/multi-document-merge-rules` to record:
  - 1-page covers are simplex with a **real** blank inside (preview + merged PDF).
  - The simplex `blank_back` face is preview-only **except** for cover blanks, which become real blank PDF pages in the merged output.
- Update `mem://features/preview-system/physical-alignment-logic` to note that body faces with missing thumbnails fall back to plain-paper rendering (no grey FileText placeholder in steady state).

## Files to touch

- `src/pages/dashboard/OrderFiles.tsx` — auto-set `is_duplex` from cover page count.
- `src/components/order/SectionList.tsx` — lock duplex toggle for 1-page covers.
- `src/lib/orders/buildJobSnapshot.ts` — insert real blank PDF page after a simplex cover for the merged print-shop output.
- `src/lib/thumbnailUtils.ts` — make `pickBestPerPage` index-stable / sparse-aware.
- `src/hooks/useDocumentUpload.ts` — remove premature early-exit, always size to `expectedPages`, warn on gaps.
- `src/components/preview/FlipBook.tsx` — empty-thumbnail body faces render as plain paper.
- `src/components/preview/PageEffects.tsx` — extend blank-paper branch.
- `mem://features/order-flow/multi-document-merge-rules` — update.
- `mem://features/preview-system/physical-alignment-logic` — update.

## Out of scope

- Changing how brochures auto-assign panels (untouched).
- Changing back-cover-card / inside-back-blank logic for bound docs with explicit back covers (untouched).
- Server-side merge implementation (the actual PDF concatenation) — this plan only stages the directive in `buildJobSnapshot`; the worker that merges PDFs is a separate future task.