# Business cards: size checker, trim box, and preview resolution

Three small, surgical fixes — all on the customer portal upload + preview path. No backend or schema changes.

## 1. Recognise business‑card sizes in the size checker

**Symptom**: Uploading an 85 × 55 mm or 90 × 55 mm card triggers the "Custom size — we don't recognise this paper size" advisory, because `src/lib/paperSizes.ts` only knows ISO A‑series + US sizes + PPT defaults. Business‑card dimensions don't match anything, so `detectedSize` falls to `UNKNOWN_SIZE_LABEL`.

**Fix**: Add a small `BUSINESS_CARD_SIZES` table to `src/lib/paperSizes.ts` listing every BC size we sell (90×50, 88.9×50.8, 85.6×54, 85×55, 90×55, 55×55, 90×100 folded flat). Then in `src/hooks/useDocumentUpload.ts` (around lines 575–581), short‑circuit the advisory logic when `productFamilySlug` is `business-cards` / `business_cards` **and** the dimensions match any known BC size (with the standard 3 mm tolerance). In that case: no `detected_size`, no `near_iso_match`, no advisory — proceed straight to finalize + render.

We also remove the redundant ISO suggestions for the BC family in `PaperSizeAdvisory` (the advisory should never fire for BC, but if it does for a truly off‑size file, suggest the nearest BC size rather than A4/A3).

## 2. Make the preview actually honour the Trim Box

**Symptom**: A business card uploaded with crop marks + bleed shows the **MediaBox** content (full bleed area with marks) in the preview instead of being cropped to the trim.

**Root cause**: The preview clip in `PreviewPanel.tsx` (`trimCrop` memo, lines 710–737) only applies when `preflight_data.trim_box_pt` is populated. There are two upload paths and only one of them persists `trim_box_pt`:

- **No‑advisory path** (`useDocumentUpload.ts` ~line 686): persists `trim_box_pt` only when `finalExplicitTrim` is true. Good.
- **Keep‑original path** (`OrderFiles.tsx` `applyKeepOriginal` ~line 533): persists `trim_box_pt` unconditionally when present. Good.
- **Missing case**: when `print-ready` finalisation rewrites the PDF, the post‑finalize asset's `boxes.TrimBox` is read into `preflight.boxes` (line 667) but `trim_box_pt` is written **only if the trim differs from the media at that moment**. For some print‑ready outputs the TrimBox survives but the comparison logic uses the wrong reference, so `trim_box_pt` is never stamped.

**Fix**: In `useDocumentUpload.ts`, always persist `trim_box_pt` and `boxes.MediaBox` from the **finalised** asset (`asset.boxes` after the `getAsset` refresh on line 631) whenever a TrimBox is present, regardless of whether it differs from the MediaBox right now. The `trimCrop` memo in `PreviewPanel.tsx` already guards against trivial differences (`< 1 mm`), so over‑persisting is safe and gives the preview the data it needs in every code path.

Additionally, when `productFamilySlug` is business cards, force `trim_box_pt` to be persisted from the asset regardless of finalize state, so the CSS trim‑clip in `LooseSheetsPreview` always engages.

## 3. Sharpen the preview render

**Symptom**: Business‑card preview looks low‑res / blurry.

**Root cause**: `PdfPageView` passes the on‑screen CSS width to `react-pdf`'s `<Page width={...} />`. react‑pdf renders its canvas at `width × devicePixelRatio` — for a 90 mm card the on‑screen canvas is ~300 CSS px, so the canvas is ~600 device px even on a HiDPI screen. That's fine for a thumbnail but visibly soft for a card you're inspecting.

**Fix**: In `src/components/preview/PdfPageView.tsx`, render the PDF at an oversampled internal resolution:

- Compute a render width of `Math.round(width × OVERSAMPLE)` with `OVERSAMPLE = 2.5` (so a 300 CSS px card renders into a 750 CSS px canvas, which becomes ~1500 device px on a 2× display).
- Wrap `<Page>` in a div with `transform: scale(1/OVERSAMPLE)` and `transform-origin: top left`, sized to the original `width × height`, so it occupies the same space on screen but uses a much sharper underlying bitmap.
- Cap the absolute canvas width (e.g. 2400 px) to avoid runaway memory on very large viewports.

The PDF blob cache (`pdfBlobCache.ts`) is unchanged — the same buffer just gets rasterised at a higher resolution.

## Technical details

**Files touched**:

- `src/lib/paperSizes.ts` — add `BUSINESS_CARD_SIZES` table + `matchBusinessCardSize(w, h)` helper.
- `src/hooks/useDocumentUpload.ts` — skip the size advisory when family is business cards and size is a known BC size; always persist `trim_box_pt` + `boxes` from the post‑finalize asset.
- `src/pages/dashboard/OrderFiles.tsx` — no change required (its `applyKeepOriginal` already persists boxes).
- `src/components/order/PaperSizeAdvisory.tsx` — small copy tweak so the rare BC custom‑size advisory suggests the closest BC size.
- `src/components/preview/PdfPageView.tsx` — oversample + CSS down‑scale for sharp preview.

**Out of scope**:

- No backend/PDF API changes. The Document Centre API already returns TrimBox correctly; we only fix how we persist and consume it on the client.
- No new pricing rules; the new sizes (85×55, 90×55) are already configured by the admin.
- No mobile‑layout changes — preview oversampling helps mobile too.

**Risk**: Low. Oversampling increases PDF.js render time per page roughly linearly with pixel count (~6× for OVERSAMPLE 2.5). Business cards only have 1–2 pages so the cost is negligible; for big documents the cap on absolute canvas width keeps memory bounded.
