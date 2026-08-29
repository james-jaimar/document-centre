# PDF proof download (watermarked, low-res)

Add a "Download PDF proof" button to the artwork proof modal so any customer (and admin) can save the exact preview they see on screen as a multi-page PDF — image-only, low resolution, with a large diagonal PROOF watermark. Not usable for printing or for stripping artwork back out.

## Behaviour

- Button sits in the proof modal header, next to the page controls.
- Clicking renders every page of the artwork (not just the visible one) using the same compositor the modal already uses, then writes each as one PDF page.
- Output is JPEG images at roughly 100–120 DPI equivalent, quality ~0.7 — sharp enough to read, useless for print.
- Each page carries a single 45-degree "PROOF" in light grey at partial opacity across the centre.
- Page size in the PDF matches the artwork's real trim size in mm, so the proof prints/reads at correct proportions.
- Filename: `proof-<template or file name>.pdf`.
- Shows a spinner/disabled state while generating; toast on failure.

## Technical

Everything runs client-side (CSR) — no server call, no edge function.

- New `src/lib/artworkTemplates/proofPdf.ts`:
  - `buildProofPdf({ pages, pageImages, placedImages, placeholders, values, trimWidthMm, title })`
  - For each `RasterisedPage`, create an offscreen canvas capped to ~1000px on the long edge, call the existing `composeTemplatePage` with `showBoxes: false`, then draw the watermark on top (rotated text, `rgba` light grey, ~35% alpha, sized to fit the page diagonal).
  - Export via `canvas.toDataURL("image/jpeg", 0.7)` and add to a `jsPDF` document (already a dependency) with per-page orientation/format derived from the page's mm dimensions.
  - No text layer, no vector content — pure raster.
- `src/components/artwork/ArtworkProofModal.tsx`: add the Download button, local `generating` state, call `buildProofPdf` and `doc.save(...)`.
- No changes to production/print-ready assembly — that path stays untouched.
