## Problem

In the customer flip-book preview, a single-sided 8‑page colour document is displayed as **16 pages** (`2 / 16` in the screenshot). That's because for simplex bound jobs we insert a synthetic `blank_back` face after every body page so the flip animation reads as physical sheets. Those blanks are preview-only — they already do **not** end up in the merged production PDF (see `buildJobSnapshot.buildMergeDirectives`, which only inserts real blank pages for 1-page simplex covers and notes "Inter-document `blank_back` faces are PREVIEW-ONLY"). But the customer-facing counters still count them, which is confusing.

## Fix

Two surgical UI changes plus a production-side audit confirmation.

### 1. `PreviewLightbox.tsx` — show "page X of <real pages>"

`PreviewLightbox` currently shows `{page + 1} / {total}` where `total = thumbnailPaths.length` — the raw padded sequence including blank-backs.

- Accept an optional `displayPageNumbers: (number | null)[]` prop (same array `PreviewPanel` already computes — `null` for synthetic blanks/tabs/inserts).
- Compute `totalContentPages = displayPageNumbers.filter(n => n !== null).length`.
- For the bottom pill, show the **current face's real page number** (or hide the number on synthetic faces and show e.g. "Blank back" / "Tab" instead), with `of {totalContentPages}`. This matches the wording `PreviewPanel` already uses (`faceLabel(...) of n`).
- Forward `displayPageNumbers` from callers (`PreviewPanel` already has it; pass it through when opening the lightbox).

### 2. `PreviewPanel.tsx` toolbar slider — already correct

`pageInfoText` already uses `totalContentPages` (the filtered count) and `faceLabel(...)` which yields e.g. "Page 2 of 8" / "Blank (Back)". No change needed there.

### 3. Production output — confirm only, no code change

`src/lib/orders/buildJobSnapshot.ts` already enforces the rule: production merge directives only insert a real blank page for **1-page simplex covers** (`simplex_cover_back` / `simplex_back_cover_front`). Body simplex blank-backs are preview-only and never reach the worker. I'll add a short doc comment near `buildPageSequence` in `buildPreviewSnapshot.ts` cross-referencing this so the invariant is obvious.

## Out of scope

- Restructuring how the preview models simplex sheets (we still need the blanks to render correctly).
- Any change to the production merge / imposition pipeline.
- Cart / order summary "Pages" badge — already uses real `page_count`, not the padded sequence.

## Files touched

- `src/components/order/PreviewLightbox.tsx` — accept `displayPageNumbers`, change the counter pill.
- `src/components/order/PreviewPanel.tsx` — pass `displayPageNumbers` (and `faceLabels`) into the lightbox when it opens.
- `src/lib/orders/buildPreviewSnapshot.ts` — comment-only clarification.
