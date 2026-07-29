## Goal

Canvas Prints jobs show "No customer preview available" in the store admin's order detail. Add a proper visual preview, matching the pattern already used for Photo Prints.

## Why it's missing today (verified)

- `JobDetailPanel.tsx` only branches on `config.photo_prints` (or `product_category === "photo-prints"`) to render `PhotoPrintsAdminGallery`. There is no canvas branch.
- The generic preview path (`buildPreviewFallback` / `PreviewLightbox`) is PDF/page based, so it finds no thumbnails or PDF sources for a canvas job — hence the empty state.
- The data is already there: `buildJobSnapshot.ts` copies the whole `spec.canvas_prints` block onto the job configuration, including per-canvas size, orientation, wrap depth, wrap mode, wrap colour, crop rect, rotation and the source image path.

## What to build

**1. `CanvasPrintsAdminGallery` component** (new, sibling of `PhotoPrintsAdminGallery`)

For each canvas in `configuration.canvas_prints.canvases[]`:

- Render a true proof of the finished canvas by reusing `renderProductionCanvas()` from `src/lib/canvasPrints/renderWrap.ts` at low DPI (~40), the same call `CanvasTile` makes on the customer side — so the admin sees exactly what the customer approved, including gallery wrap bleed or the solid colour wrap edges.
- Show the composed canvas (front + wrap edges) rather than only the front face, so the wrap treatment is visible at a glance.
- Caption each tile: file name, finished size (e.g. `A2 — 594 × 420 mm`), orientation, wrap depth (`38 mm`), wrap mode label from `WRAP_MODE_OPTIONS`, a small colour swatch + hex when the mode is colour wrap, and a `×qty` badge.
- Header line summarising: N canvases, total prints, and the common size/depth.
- Click a tile to open a larger lightbox view of the same composed render.

**2. Image loading / CORS**

The composed render reads pixels from a canvas, so the source image must be same-origin. Use the existing same-origin download proxy (`downloadFromS3` in `src/lib/s3Storage.ts`) to fetch the image as a blob and render from an object URL, rather than a signed S3 URL — this is the same fix already applied in the customer builder. Prefer `preview_path` → `thumb_path` → `original_storage_path` so admins aren't downloading 40 MB originals.

Graceful fallbacks: skeleton while loading, and if the render fails, fall back to a plain `<img>` of the signed source with the spec text still shown.

**3. Wire it into `JobDetailPanel.tsx`**

Extend the existing branch so a job with `config.canvas_prints` (or `product_category === "canvas-prints"`) renders `CanvasPrintsAdminGallery` instead of the empty preview block and generic attached-files list — mirroring how photo prints are handled today.

## Notes

- No database, pricing, or production-PDF changes; this is presentation only. The print-ready CMYK PDFs continue to come from the existing production panel.
- Existing orders will work retroactively, since the render is computed from the stored spec rather than a baked thumbnail.
