
## Problem

The brochure fold preview's `sliceImageIntoPanels` function in `FoldPreview.tsx` sets `img.crossOrigin = "anonymous"` to avoid canvas tainting. However, Supabase signed storage URLs don't return the required CORS headers (`Access-Control-Allow-Origin`), causing the `Image` element to reject the response and fire `onerror`.

This manifests as "Failed to load surface image for slicing" on the Configure Options page for all fold types.

## Fix

**File: `src/components/preview/FoldPreview.tsx`**

Replace the `sliceImageIntoPanels` function to fetch the image as a blob first (using `fetch()` which doesn't require CORS for rendering), create an object URL from the blob, and load the `Image` from that local blob URL. This completely avoids the CORS issue since the canvas draws from a same-origin blob URL.

The function becomes `async` and:
1. `fetch(imageUrl)` → `res.blob()` → `URL.createObjectURL(blob)`
2. Load `new Image()` from the object URL (no `crossOrigin` needed)
3. Slice into panels via canvas as before
4. `URL.revokeObjectURL()` after done
5. Falls back to direct load for `data:` URLs that don't need fetching
