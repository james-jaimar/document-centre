## Two independent fixes

### 1. Bleed / crop marks showing inside flipbook pages

**Cause.** When an asset is normalised we call `derive_default_render_box()` and detect a TrimBox/BleedBox smaller than the MediaBox. That box is passed through to `generate_previews`, but the new batch pipeline only physically crops the source PDF when `preview_render_box_mode == 'rewrite_pdf'`. The default mode is `metadata_only`, so the detected box is stored on the job but **never applied** to the Ghostscript rasterisation — the JPEG previews are rendered to the full MediaBox, bleed and crop marks included.

That also explains the "jumps to uncropped" behaviour: the eyeglass shows a thumbnail that was rendered earlier under the old pipeline (cropped), then the flipbook loads the freshly-generated full-size preview (uncropped).

**Fix (server, `pdf-server/app/tasks/document_tasks.py`).**

1. In `_maybe_rewrite_with_box`, crop the working PDF with `pdf_ops.crop_to_box` **whenever an effective render box is present**, regardless of `preview_render_box_mode`. The `metadata_only` mode was a no-op for raster previews; it only made sense when GS was asked to honour TrimBox via `-dUseTrimBox`, which we never wired up.
2. Apply the same rewrite in both `_generate_previews_batch` and `_generate_previews_parallel_local` so the fallback paths produce trimmed JPEGs too. The sequential path already crops via `crop_to_box`, so it stays as-is.
3. Record `render_box_applied: true|false` and the box itself in the job event metadata so we can verify per-job in the platform Jobs view.
4. Re-run preview generation for this specific asset (NPC113 Annual Report) as a one-off after deploy by enqueueing a new `generate_previews` job from the platform Jobs page — no migration needed.

No DB schema change. No change to `derive_default_render_box` or `crop_to_box` themselves — they already handle landscape + `/Rotate` correctly.

### 2. Full-screen landscape flipbook only uses ~50% of the viewport

**Cause.** `src/components/preview/FlipBook.tsx` computes:

```text
scaleFactor = Math.min(scaleX, scaleY, 1)
```

The `, 1` cap prevents the fixed 400px-wide internal page from scaling **up**. On a 1920×1080 lightbox (passed in at 0.95 × 0.92 of the window), `scaleX` ≈ 2.18 and `scaleY` ≈ 3.3, but both are clamped to 1 — so a landscape spread renders at 800px wide on a 1920px screen ≈ 42% utilisation.

**Fix (frontend, `src/components/preview/FlipBook.tsx`).**

1. Replace `Math.min(scaleX, scaleY, 1)` with `Math.min(scaleX, scaleY)` so the spread fills the available area on both axes.
2. Add a generous safety cap (e.g. `Math.min(scaleX, scaleY, 4)`) just to avoid pathological cases on ultrawide monitors — JPEG previews are rendered at 150 DPI so 3-4× upscale is still visually fine.
3. No change to `PreviewLightbox.tsx` — its 0.95 / 0.92 envelope is already correct; the bottleneck was the flipbook cap.

After this change, a landscape A4 lightbox spread will fill ≈85-90% of the viewport width on a 1920px screen.

### Out of scope (flag for follow-up if needed)

- PDFs that have **visible crop-mark artwork baked into the content stream** but no smaller TrimBox cannot be detected by `derive_default_render_box`. If the NPC113 file turns out to be like that (TrimBox == MediaBox), the server fix alone won't help — we'd need a separate "user-specified bleed" or content-based crop detection feature. I can investigate the actual file's boxes after deploy if the issue persists.
- `PdfPageView` (used by `LooseSheetsPreview`, not the flipbook) renders via pdf.js, which honours CropBox not TrimBox. Bound-document flipbooks don't use it, so this is not relevant to the reported issue.

### Verification

- After deploy: re-trigger previews for the NPC113 asset; confirm new preview JPEGs are trimmed (open one directly from the platform Jobs > Assets panel).
- Open the same doc in the customer lightbox: spread should fill ~85% of the viewport and show no crop marks.
- Smoke-test a portrait A4 booklet that has no TrimBox to confirm `render_box_applied: false` and rendering is unchanged.
