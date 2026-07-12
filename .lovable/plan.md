## Scope

Two items from the last message:

1. **Landscape uploads for Flyers** — already works, no code change needed.
2. **Preview trim accuracy** — investigate and fix over-cropping so the customer preview matches exactly what will print.

---

## 1. Landscape auto-handling (verify only, no changes)

Confirmed against the current code:

- `orientationPolicy.ts` — Flyers are not in `PORTRAIT_REQUIRED` / `LANDSCAPE_REQUIRED`, so nothing is force-rotated.
- `OrderBuild.tsx` size auto-detect (L487–503) matches a pack row by dimensions in either orientation, and prefers the row whose stored `orientation` matches the upload. That's why the UI already labels the upload "A5 Landscape (297 × 148 mm)".
- `docOrientationForCanvas` (L659–703) reads the actual PDF page dimensions, so the preview renders landscape when the PDF is landscape.

No code change here. The plan drops the earlier proposal to add a Flyers-only tie-breaker.

---

## 2. Preview trim over-crop (real bug — investigate then fix)

Ground truth from the uploaded `A5_Landscape.pdf`:

- MediaBox: 637.276 × 461.528 pt (224.9 × 162.9 mm)
- TrimBox: `[21, 21, 616.276, 440.528]` → 210 × 148 mm inset 21 pt (7.4 mm) on every side
- BleedBox: `[12.5, 12.5, 624.78, 449.03]` → 216 × 154 mm (3 mm bleed)
- Rotation: 0

When I crop the rendered page to the **metadata TrimBox** manually, both the designer's pink "Cut Line" dashes and the gray "Type unsafe area" band remain visible inside the crop (they were drawn as ink inside the TrimBox). The user reports the app preview does not show them — meaning the preview is clipping **tighter than the TrimBox**.

Candidate causes to check in order:

1. **`preflight.trim_box_pt` stored the wrong rectangle.** `OrderFiles.tsx` (L740–760, L1049–1096, L1329–1369) writes `trim_box_pt` from several code paths (upload → crop-mark trim → session pipeline). If any of those paths persist the BleedBox, or the intersection of TrimBox∩BleedBox, or a shrunk-for-safety rect, `PreviewPanel.resolvedTrimBox` will honour it and over-crop. Read the persisted `preflight_data.trim_box_pt` and `preflight_data.boxes.TrimBox` for a Flyers upload of this exact file and compare against the ground truth above.

2. **`PreviewPanel.trimCrop` math (L785–811).** Currently:
   ```
   left = trim[0] * PT_TO_MM / mediaWmm
   top  = 1 - trim[3] * PT_TO_MM / mediaHmm
   width  = (trim[2]-trim[0]) * PT_TO_MM / mediaWmm
   height = (trim[3]-trim[1]) * PT_TO_MM / mediaHmm
   ```
   Verified against the ground-truth boxes this yields `{ left: 0.0330, top: 0.0455, width: 0.9341, height: 0.9090 }` — correct. So if `resolvedTrimBox` is right, `trimCrop` will be right.

3. **`page_width_mm` / MediaBox derivation.** `PreviewPanel.trimCrop` prefers `boxes.MediaBox` when present, otherwise falls back to `doc.page_width_mm`. On this file `page_width_mm` was likely set to the **TrimBox** dimensions (210 × 148), not the MediaBox (224.9 × 162.9). If `boxes.MediaBox` is missing from `preflight_data`, `mediaWmm/mediaHmm` become the TrimBox size, the fractions collapse to a much smaller inner rectangle, and the preview over-crops. **This is the most likely cause** — worth checking first.

4. **`LooseSheetsPreview` clip transform (L115–170)** — verified: `renderW = pdfW / trimCrop.width`, `offsetX = -trimCrop.left * renderW`. Correct for a well-formed `trimCrop`.

### Fix (once cause is confirmed)

- If (3) is confirmed: in `PreviewPanel.tsx` `trimCrop`/`resolvedTrimBox`, when `boxes.MediaBox` is absent, either
  - abort the crop (return `undefined`) instead of applying it against the TrimBox dimensions (safe fallback: preview shows the whole page without clipping crop marks), or
  - reconstruct MediaBox from the persisted `boxes.MediaBox` at upload time by making the preflight writer always store all four boxes when it stores any of them.

  Prefer the latter (`OrderFiles.tsx` L614–621, L1049–1096, L1329–1369, and `useDocumentUpload.ts` L742–835): always persist `preflight_data.boxes.MediaBox` alongside `trim_box_pt`, so downstream code has an unambiguous denominator.

- If (1) is confirmed: fix the writer that stored the wrong rectangle. Do not touch `PreviewPanel`.

- Add a small dev-only console warning in `PreviewPanel.trimCrop` when the derived fractions produce a rectangle smaller than 80 % of the media on either axis, so future regressions surface immediately.

### Verification (mandatory)

1. Upload `A5_Landscape.pdf` to a Flyers product.
2. Read `documents.preflight_data` for the row and confirm `boxes.MediaBox = [0,0,637.276,461.528]` and `boxes.TrimBox = [21,21,616.276,440.528]`.
3. Confirm the on-screen preview shows the pink dashed cut line and the gray "type unsafe" band around the edges (they are drawn inside the TrimBox and must remain visible).
4. Confirm the annotation panel on the right (which is outside the TrimBox) is clipped away.
5. Repeat with a Business Cards upload that has crop marks — must still hide crop marks (existing behaviour).

---

## Out of scope

- Any change to the pack-pricing plumbing.
- Any change to preview rendering for bound/folded/ring products.
- Any change to server-side preflight extraction on the PDF worker — this plan only touches how the client persists and consumes those boxes.

## Files likely touched

- `src/components/order/PreviewPanel.tsx` — safer fallback in `resolvedTrimBox` / `trimCrop`, dev-only sanity warning.
- `src/hooks/useDocumentUpload.ts` and `src/pages/dashboard/OrderFiles.tsx` — always persist `preflight_data.boxes.MediaBox` alongside any TrimBox write, so `PreviewPanel` has an unambiguous denominator.
