

# Wait for All Thumbnails Before Completing

## Problem

The thumbnail polling loop (line 117 in `useDocumentUpload.ts`) breaks as soon as `thumbnailPaths.length > 0`. For a 24-page PDF, page 1's thumbnail appears first, the loop exits, and only 1 thumbnail is saved to `thumbnail_urls`. The lightbox then only shows 1 page with no arrows.

## Fix

Change the polling condition to wait until the number of thumbnails matches the expected page count. The `fetchThumbnails` helper already returns `pageCount` from the asset metadata.

### `src/hooks/useDocumentUpload.ts`

Replace the thumbnail polling loop condition:

**Before:** `final_.thumbnailPaths.length === 0`

**After:** Check if we have fewer thumbnails than expected pages. Continue polling while `final_.thumbnailPaths.length < (final_.pageCount ?? 1)`. This ensures a 24-page PDF waits until all 24 thumbnails are rendered.

Also add a progress calculation based on thumbnails found vs expected, so the modal shows meaningful progress (e.g., "Rendering pages… 12/24").

Update `statusText` to include the count: `"Rendering pages… (${found}/${expected})"`.

### No other files change

The `PreviewLightbox` already has left/right arrows and keyboard navigation — they just weren't showing because `thumbnailPaths` only had 1 entry.

