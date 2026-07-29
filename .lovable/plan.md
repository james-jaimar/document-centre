## Goal
Server-side print-ready PDF per canvas upload — CMYK, sized to real print geometry, ready for a large-format canvas printer.

## Output contract
- **One canvas = one PDF.** Each `CanvasPrintEntry` produces its own single-page PDF at `order_jobs.print_ready_pdf_path` (array column) — no multi-page concatenation.
- **CMYK** throughout. No RGB output.
- **300 dpi target.** Never upscale beyond the source. Warn the customer at editor/checkout time if the effective front-face DPI falls below 150.

## Page geometry
Given finished front `W × H` (mm), wrap depth `D` mm (25/38/50), overwrap bleed `B = 5 mm`:

| Wrap mode        | Page size                              | Image placement |
|------------------|----------------------------------------|-----------------|
| No edge print    | `W × H`                                | Crop fills the page |
| Gallery wrap     | `(W + 2D + 2B) × (H + 2D + 2B)`        | Whole image scaled to fill the full page; crop remains centred on the front face |
| Colour wrap      | `(W + 2D + 2B) × (H + 2D + 2B)`        | Page filled with CMYK-converted `wrapColorHex`; cropped image placed at exact `W × H` in the centre |

```text
  ┌──────── B (5mm) ────────┐
  │  ┌──── D (25/38/50) ──┐ │
  │  │  ┌──────────────┐  │ │
  │  │  │  W × H front │  │ │
  │  │  └──────────────┘  │ │
  │  └────────────────────┘ │
  └─────────────────────────┘
```

TrimBox = front `W × H`, MediaBox = full page (front + wrap + bleed).

## Colour handling
- **Front image**: flatten onto opaque white first (kills PNG/HEIC alpha), embed sRGB source profile, convert to CMYK using the family's configured ICC profile (default `fogra39` — same pipeline as the rest of production PDF).
- **Wrap fill colour**: convert `wrapColorHex` from sRGB to the destination CMYK profile using the same intent as the family (default `relative_colorimetric`), and paint the wrap+bleed area with that CMYK value directly (no RGB round-trip in the PDF).
- No transparent objects in output — everything flattened.

## DPI warning (customer-facing, not a hard block)
- Compute effective DPI = `croppedAreaPixels.width / (W_mm / 25.4)`.
- Show an inline warning in `CanvasEditorModal` and on the cart summary when `< 150 dpi`.
- Never warn about resolution above 150; never auto-scale; never refuse checkout.

## Where the work runs
Real render happens on the pdf-server (Cloud Run / Python), consistent with the rest of production PDF. Edge functions stay thin proxies.

1. **pdf-server (Python)**
   - New service module `pdf-server/app/services/canvas_prints_assembly.py` alongside `photo_prints_assembly.py`.
   - New endpoint `POST /v1/operations/assemble-canvas-print-ready` accepting `{ job_id }`, returning an async `job_id` in the same shape as the other operations.
   - For each `CanvasPrintEntry` on the job:
     - Download the source from S3 (existing storage helpers).
     - Flatten onto white.
     - Build the front raster at `W × H` from the crop (using `croppedAreaPixels` + rotation) at ≥300 dpi (or source-native if lower).
     - For gallery wrap: rescale the whole flattened image to the full page instead.
     - Convert to CMYK via `icc_profiles.resolve_profile()`.
     - Compose the page: CMYK wrap fill (colour wrap) or transparent (others), then paint the image at the correct offset.
     - Emit a single-page PDF with the MediaBox/TrimBox above, embed the CMYK output profile, and upload to S3.
   - Write the array of storage paths back to `order_jobs.print_ready_pdf_paths` (new jsonb column) and mirror the first path into the existing `print_ready_pdf_path` for backwards compatibility with the download UI.

2. **Supabase side**
   - Migration: add `print_ready_pdf_paths jsonb` to `order_jobs` (nullable). Grants/policies unchanged (already covered by existing job policies).
   - `production-pdf` edge function: add a new `action = "assemble_canvas"` mapped to the new pdf-server endpoint.
   - `enqueue-print-ready`: route jobs whose `product_category` is `canvas_wrap` (or family kind `canvas_wrap`) to `assemble_canvas` instead of the standard `assemble`. Remove canvas from the RGB skip list — it needs a proper CMYK assemble.

3. **Frontend**
   - `useProductionArtefacts`: surface `print_ready_pdf_paths` as an array so the operator UI shows one download link per canvas.
   - `CanvasEditorModal` + cart tile: add the < 150 dpi warning banner using the formula above.

## Non-goals
- No changes to on-screen 3D preview, cropper, or pricing.
- No imposition for canvas — each PDF is printed as its own sheet on the large-format device.
- No print-shop-side proofing UI changes beyond exposing the download links.

## Technical notes
- CMYK conversion uses the same `icc_profiles` / `render_intent` config already used for the rest of production PDF (`FamilyPrintConfig` fields on the canvas product family). Default `fogra39` / `relative_colorimetric` if unset.
- The 5 mm overwrap is included in the MediaBox as bleed — the printer's cutter/wrapping station uses it as the tuck-under.
- `print_ready_pdf_paths` stays ordered to match `spec.canvas_prints.canvases[]` so operators can match a PDF back to a specific canvas in the item.