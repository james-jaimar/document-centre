## Problem

The inline PDF preview for static documents (flyers, loose sheets, etc.) has three visual issues:

1. **Black box behind the PDF** -- `react-pdf`'s `<Page>` renders a canvas with `canvasBackground="transparent"`, but the parent container's `bg-card` class creates a dark background in dark theme.
2. **White border + gray shadow** -- The `LooseSheetsPreview` wrapper applies `border border-border shadow-lg` and a multi-layer `boxShadow` that creates the stacked-paper effect. This was fine for thumbnails but is wrong for the new PDF rendering -- the user just wants to see the media shape cleanly.
3. **Unnecessary PageEffects wrapping** -- The PDF is already the trimmed file; wrapping it in `PageEffects` adds extra insets and styling that aren't needed.

## Plan

### 1. Clean up LooseSheetsPreview when rendering PDF

When a `pdfSource` is available, skip the decorative wrapper (border, shadow, bg-card) and the `PageEffects` layer. Render `PdfPageView` directly inside the centering container with just a minimal white background (to ensure the PDF page is visible against any theme).

### 2. Fix PdfPageView canvas background

Set `canvasBackground` to `"white"` (or `"#ffffff"`) instead of `"transparent"` so the page renders with a proper paper-white backing regardless of the theme.

### 3. Remove double aspect-ratio fitting

Currently both `LooseSheetsPreview` and `PdfPageView` independently compute sizing from the aspect ratio, resulting in the PDF being smaller than the container (95% of an already-65% space). Simplify: `LooseSheetsPreview` computes the page dimensions, and `PdfPageView` receives exact `width`/`height` and renders at that size without re-shrinking.

### Files to edit

- `src/components/preview/LooseSheetsPreview.tsx` -- conditionally skip border/shadow/PageEffects for PDF mode
- `src/components/preview/PdfPageView.tsx` -- use white canvas background, remove internal re-sizing logic, render at the exact width passed in
