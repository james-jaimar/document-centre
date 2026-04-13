

## Improve thumbnail rendering resolution for crisp FlipBook previews

### Problem
Thumbnails appear soft/blurry in the FlipBook preview. The server's `auto_queue` rasterization likely uses a low default DPI (72–96), producing small images. The FlipBook renders at 350px per page internally but CSS-scales up to fill the container — on HiDPI screens this makes the softness very visible.

### Resolution math
- FlipBook internal width: **350px** per page
- Typical container display: ~400–500px per page (main panel), up to ~800px in lightbox
- HiDPI (2x): need **~800–1000px** wide thumbnails for crispness
- A5 at 150 DPI → **874×1240px** — crisp at 2x in FlipBook and adequate for lightbox
- A4 at 150 DPI → **1240×1754px** — more than enough

### Changes

**`src/lib/documentCentreApi.ts`**
- Add a `rasterize` operation endpoint that accepts `asset_id` and `dpi` parameter, allowing explicit control over the initial thumbnail generation DPI
- Bump `cropRasterize` default DPI from 120 → **150**

**`src/hooks/useDocumentUpload.ts`**
- After the initial `auto_queue` jobs complete, trigger an explicit **rasterize at 150 DPI** if the auto-generated thumbnails are too small (or always, to guarantee quality)
- Alternatively, pass `rasterize_dpi: 150` in the `createAsset` metadata if the server supports it

**`src/components/preview/FlipBook.tsx`**
- Consider bumping `BASE_PAGE_WIDTH` from 350 → **400** for slightly better native rendering (optional, minor impact)

### Approach decision needed
The server's `auto_queue` behavior is controlled server-side. Two paths:

1. **If the server accepts a DPI parameter on `createAsset`**: Pass `metadata: { rasterize_dpi: 150 }` — simplest fix
2. **If not**: After auto_queue completes, fire an explicit `cropRasterize` with the full MediaBox at 150 DPI for all uploads (not just bleed-trimmed ones) — this replaces the low-res auto thumbnails with higher-res versions

Both approaches ensure all new uploads get ~150 DPI thumbnails. Existing documents would need a re-process to benefit.

### Result
- Thumbnails render at ~150 DPI instead of ~72-96 DPI
- FlipBook pages appear crisp on both standard and HiDPI displays
- Lightbox preview quality also improves significantly
- File size impact is modest (~2-3x larger PNGs per page, but still small vs. source PDFs)

