## Goal

Stop the customer preview from chopping into artwork on PDFs that carry a proper TrimBox + bleed (like your Nissan catalogue). The finished-page area (TrimBox) must render fully — no matter which Fit/Fill mode is selected and no matter how the container is sized.

## What we know

- The uploaded PDF has MediaBox 637.276×883.89 pt, TrimBox 595.276×841.89 pt (A4), 7mm bleed all sides.
- Rendering the TrimBox area in isolation shows every element (including the right-side "Fits ..." badges) inside the trim — the artwork is fine.
- The customer preview clips those badges even with **Fit** selected. Fit mode should never clip, so the trim math is misbehaving for this box geometry.
- No `documents` row exists for this file, so we can't yet inspect what preflight actually captured. Part of the plan is to capture that.

## Suspected causes (to confirm via instrumentation, then fix)

1. `page_width_mm` / `page_height_mm` stored at upload may be MediaBox dimensions (224.8 × 311.7 mm), but `PreviewPanel.pdfSizeMm` and `trimCrop` assume they refer to TrimBox — producing an inconsistent reference frame.
2. `resolvedTrimBox` in `PreviewPanel.tsx` also accepts `boxes.CropBox` — if CropBox equals MediaBox (as in most exports), it wrongly treats the whole media as the trim and never crops the bleed/marks off; the "chop" then comes from downstream size-mismatch math forcing the page into a smaller canvas at the wrong aspect.
3. `hasSizeMismatch` comparisons in `LooseSheetsPreview.tsx` compare canvas mm to `pdfSizeMm` mm — if `pdfSizeMm` is derived from Trim but `canvasSizeMm` is A5 (148×210) and the trim is A4 (210×297), we end up on the "fit" branch with `pdfAspect > canvasAspect`, which lays out `pdfW = canvasWidth` but leaves the (already-scaled) inner PDF at an offset that overflows the parent `overflow: hidden` box when the browser rounds.

## Step 1 — Reproduce with real data (no code change)

- Ask you to re-upload the Nissan PDF into the same demo storefront so a `documents` row exists.
- Query `documents.preflight_data` for that row and confirm exactly what `boxes`, `trim_box_pt`, `page_width_mm`, and `page_height_mm` were persisted. This tells us which of (1)/(2)/(3) is in play.

## Step 2 — Tighten the TrimBox resolver

In `src/components/order/PreviewPanel.tsx`:

- `resolvedTrimBox` should only return a box that is **strictly smaller** than the MediaBox (≥1pt smaller on any edge). If `boxes.TrimBox == boxes.MediaBox` or only `CropBox` is present and equals MediaBox, return `undefined` so no crop is applied.
- Add BleedBox as a **secondary** fallback — if TrimBox is missing but BleedBox is strictly inside MediaBox, use BleedBox so the crop marks still get hidden.

This mirrors the server-side `derive_default_render_box` rule that already exists in `pdf-server/app/services/pdf_ops.py` (lines 3474–3532) and stops false-positive crops.

## Step 3 — Make `pdfSizeMm` internally consistent with `trimCrop`

Also in `PreviewPanel.tsx`:

- When `trimCrop` is active, `pdfSizeMm` must describe the **TrimBox** in mm (which it already tries to do). When `trimCrop` is NOT active, `pdfSizeMm` must describe the **MediaBox** in mm using `boxes.MediaBox` if present, falling back to `page_width_mm/height_mm` only as a last resort. This removes the aspect-ratio drift that puts the "fit" branch into an off-by-1% clip.

## Step 4 — Guarantee Fit mode never clips

In `src/components/preview/LooseSheetsPreview.tsx`:

- The outer white canvas currently applies `overflow: hidden` when `(isFill && hasSizeMismatch) || useTrimClip`. This is correct in intent but the inner `pdfW/pdfH` calc can round up past `canvasWidth/canvasHeight` in the fit branch. Change the fit branch to compute `pdfW`/`pdfH` with `Math.floor` and remove any residual sub-pixel overflow so Fit mode is provably clip-free.
- In Fill mode the current behaviour (over-render + clip to trim) is retained.

## Step 5 — Verify against your file

Once (2)–(4) are in, re-upload the Nissan catalogue and screenshot both Fit and Fill in the customer preview. Success criteria:

- Fit mode: entire TrimBox visible, letterboxed against the paper canvas.
- Fill mode: TrimBox fills the paper canvas, crop marks / bleed area clipped, all in-trim content (including right-column badges) intact.

## Out of scope

- Server-side rendering / print-ready PDF path — that already respects TrimBox (`respect_trim_box=True` in `pdf_ops.py`) and is not what you're looking at.
- Ring-binder / flip-book previews — they intentionally don't apply `trimCrop` today; leave unchanged.
- Any change to size auto-detection or the A4→A5 warning UX.

## Files touched

- `src/components/order/PreviewPanel.tsx` — tighten `resolvedTrimBox`, add BleedBox fallback, make `pdfSizeMm` consistent.
- `src/components/preview/LooseSheetsPreview.tsx` — guarantee Fit branch cannot overflow the canvas.
- (No DB, no edge-function, no server-side PDF changes.)
