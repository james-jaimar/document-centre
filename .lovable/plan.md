

# Plan: Fix Auto-assign Detection and Preview for Brochures

## Problems

### 1. Auto-assign button not appearing
The auto-assign button in `SectionActions` requires `familySlug === "brochures"` AND `selectedFilePageCount >= 2`. Two likely failures:
- **Single-page images**: When the user uploads single images (not multi-page PDFs), `page_count` is 1, so neither auto-assign button appears. This is correct behavior but confusing — the user expects some guidance.
- **`page_count` may be null/0**: If the document processing hasn't completed or `page_count` wasn't set, the button won't appear even for multi-page PDFs.

### 2. No preview on OrderBuild (step 2)
The `PreviewPanel` fold path looks for `front_cover` and `back_cover` sections. If the user didn't successfully assign sections (because auto-assign wasn't available and they didn't manually assign), there are no sections to preview.

Even if they did manually assign via "Outside" / "Inside" buttons, if the document has `page_count = 1` (single image), the section's `page_range_start` defaults to `0` and `thumbnail_urls[0]` should resolve — so this path should work if sections exist.

### 3. Missing guidance for single-image uploads
For brochures with single images, the user should simply use "Outside" and "Inside" manual buttons. But there's no clear prompt or help text explaining this workflow.

## Solution

### A. Always show auto-assign for brochures when 2+ pages (already works)
No change needed — this already works when `page_count >= 2`.

### B. For single-image uploads, auto-create section on assignment
When a user clicks "Outside (front of sheet)" for a 1-page document, the section is created with `page_range_start: 0`. This already works. The preview should pick it up.

### C. Fix the preview to handle the case where thumbnails are composed data URLs
When `composePanelImages` returns a data URL (starts with `data:`), `DocumentPreview.batchSignUrls` tries to sign it as a storage path, which fails. Need to pass composed data URLs through without signing.

### D. Fix `batchSignUrls` / `DocumentPreview` to handle data URLs
In `DocumentPreview`, when a thumbnail path starts with `data:` or `http`, skip signing and use it directly.

### E. Add helpful text for single-file brochure workflow
Show a brief hint in `SectionActions` when the product is a brochure and the selected file has only 1 page: "Assign this image as the Outside or Inside of your brochure."

## Changes

| File | Change |
|------|--------|
| `src/components/preview/DocumentPreview.tsx` | In the `batchSignUrls` effect, detect paths that are already full URLs (data: or https:) and pass them through without signing. |
| `src/components/order/SectionActions.tsx` | Add a hint message for brochures when selected file has 1 page: guide user to use Outside/Inside buttons manually. |
| `src/components/order/PreviewPanel.tsx` | In `foldSectionData`, add fallback: if section has no `page_range_start`, default to index 0. Also handle case where `thumbnail_urls` array might use full URLs vs storage keys. |

## Implementation order
1. Fix DocumentPreview to pass through data URLs and already-signed URLs
2. Add guidance text in SectionActions for single-page brochure files
3. Verify PreviewPanel fold thumbnail resolution handles edge cases

