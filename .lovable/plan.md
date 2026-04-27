## Page-count Guards for Single-Sheet Products

Add post-upload validation for products where the page count is physically constrained by the format. Catches users uploading 20-page PDFs as flyers, single-page files as brochures, etc.

### Rules per product family

| Family | Allowed pages per file | If too many | If too few |
|---|---|---|---|
| `flyers` | 1 (single-sided) or 2 (double-sided) | Prompt: trim to first 2 pages, or replace file | n/a |
| `brochures` / folded leaflets | Exactly 2 (Outside + Inside) for the simple flow, OR exact panel count for panel-per-page (4 for bi-fold, 6 for tri/z, 8 for gate) | Prompt: trim to required, or replace | Block assignment with toast: "Brochure needs at least 2 pages" |
| `business-cards` | 1 or 2 | Prompt: trim to first 2, or replace | n/a |
| Others (bound, posters, presentations, photo) | unchanged | — | — |

Brochures already have panel-validation in the auto-assign step (see `mem://features/order-flow/brochure-validation-logic`); this plan adds the **upload-time** guard so the user is warned before they start configuring.

### How the warning flows

A new modal `PageCountWarningDialog` (built on `Dialog`) appears immediately after upload completes (after preflight, before the user starts assigning sections) when any uploaded document exceeds the family's max page count. It lists the offending file(s) and offers:

- **Trim to first N pages** — calls the existing `pdf-api` `crop`/page-extract operation to produce a trimmed PDF, replaces the document's `file_path` (asset id stays stable, thumbnails re-render via standard reprocess flow).
- **Replace file** — deletes the document row and re-opens the file picker.
- **Cancel** — leaves the document as-is (user can manually fix or delete it). For brochures with too-few pages, the cancel option is removed and they must replace.

For brochures/leaflets specifically: if the uploaded file has `page_count < 2`, surface a hard block toast/modal (no "trim" option — there's nothing to trim) directing the user to upload a 2-page or panel-per-page PDF.

### Technical changes

**New files**
- `src/components/order/PageCountWarningDialog.tsx` — modal with the trim/replace/cancel actions, takes `{ files: Array<{docId, fileName, pageCount, allowedMax}>, onTrim, onReplace, onCancel }`.
- `src/lib/pageCountRules.ts` — pure helpers: `getAllowedPageCount(familySlug)` returning `{ max: number | null, min: number, exact?: number[] }`, plus `validateDocumentPages(doc, familySlug)` returning a violation reason or `null`.

**Edited files**
- `src/pages/dashboard/OrderFiles.tsx`
  - After `uploadFiles` resolves (around line 990 / 1134 / 1255), iterate the resulting documents and run `validateDocumentPages`. If any violations exist, open `PageCountWarningDialog`.
  - Wire the **Trim** action to a new `trimDocumentPages(docId, keepPages)` helper that calls `pdf-api`'s page-extract op (already used elsewhere via `documentCentreApi.ts`) and overwrites the same `file_path`, then triggers `reprocessDocument` to refresh thumbnails.
  - Wire **Replace** to `deleteDocument(docId)` + `inputRef.current?.click()` on the existing uploader.
- `src/lib/documentCentreApi.ts` — add a thin `extractPages(assetId, ranges)` wrapper if not already present; falls back to the existing `cropRasterize` flow if needed.
- `src/components/order/SectionActions.tsx` — when the user clicks "Auto-assign Outside + Inside" for brochures and the doc only has 1 page, show inline error instead of a silent no-op.

### Out of scope (this iteration)
- Word/PowerPoint files: validated **after** PDF conversion (the converted PDF's page count is what matters).
- Posters: already routed through the editor — no page-count rule.
- Bound documents, presentations, photo prints: keep current behavior.
- Multi-file uploads where the user intends to combine sections: the warning only fires for files that **on their own** exceed the cap; for flyers/business-cards/brochures the upload pattern is one file per job.

### UX copy (draft)

Title: **"Too many pages for a {Family}"**

Body: "{filename.pdf} has {N} pages, but a {flyer | business card} can only have {1 single-sided / 2 double-sided}. What would you like to do?"

Buttons: `Use first 2 pages` · `Replace file` · `Keep anyway`

For brochure with <2 pages — Title: **"Brochure needs at least 2 pages"** · Body explains Outside + Inside requirement. Buttons: `Replace file` · `Cancel`.
