<final-text>
## Fix plan: enforce a real minimum preview resolution for FlipBook

### What I found
The code is already asking the backend for high-res previews:
- `useDocumentUpload.ts` calls `rasterize(asset_id, 150)`
- `cropRasterize()` defaults to `150`
- `FlipBook.tsx` already uses `BASE_PAGE_WIDTH = 400`

So the issue is probably not “we forgot to request higher DPI”.

The more likely problem is thumbnail selection:
- `fetchThumbnails()` and `reThumbnail()` currently take the **first derived image per page**
- they do **not** prefer the biggest/highest-resolution file
- if the backend returns old low-res auto-queue thumbnails before the newer 150 DPI ones, the UI keeps using the soft version

### Resolution target
Because the FlipBook never displays pages larger than about **400px wide**, the practical minimum for “decent” quality is roughly:
- **A5:** about **420px wide** (72 DPI equivalent)
- **A4:** about **595px wide** (72 DPI equivalent)

So your “at least 72 DPI” requirement is reasonable for the inline FlipBook.
I would still keep backend rendering at **150 DPI**, but enforce a **72 DPI minimum acceptance threshold** in the frontend selection logic.

### Changes to make

**1) `src/hooks/useDocumentUpload.ts`**
- Replace the current “first thumbnail per page wins” logic
- Group derived files by page
- Pick the **best candidate per page** by:
  - cropped/trimmed version first when appropriate
  - then **largest `width` / `height`**
- Compute effective preview DPI from:
  - selected image width
  - page width in mm
- If the selected result is below **72 DPI equivalent**, force a fresh rasterize and refetch before saving `thumbnail_urls`

**2) `src/pages/dashboard/OrderFiles.tsx`**
- Apply the same “pick highest-resolution candidate per page” logic in `reThumbnail()`
- This keeps bleed/orientation reprocessing from falling back to soft previews

**3) `src/lib/thumbnailUtils.ts`** (hardening)
- If re-rendered thumbnails reuse the same storage path, clear or bypass the signed URL cache after reprocessing
- This avoids the browser showing a stale low-res image after a higher-res render replaces it

### Expected result
- FlipBook uses the sharpest derived file available for each page
- Anything below a **72 DPI equivalent floor** is rejected and re-rendered
- Existing 150 DPI backend rendering stays in place
- Inline preview should look properly crisp on a normal desktop screen

### Technical details
Suggested selection rule per page:
```text
1. Prefer cropped_* if trim preview is intended
2. Otherwise compare candidates by width desc, then height desc
3. Save only the best path for each page
4. Compute effective dpi = pixel_width / (page_width_mm / 25.4)
5. If dpi < 72, trigger rasterize/crop-rasterize and refetch
```

### Verification
After implementation, test with one A5 and one A4 PDF and confirm:
- chosen thumbnail widths are at least ~420px (A5) / ~595px (A4)
- FlipBook looks crisp in the normal preview
- reprocessed files stay crisp too
- no stale low-res image remains after trim/orientation changes
</final-text>