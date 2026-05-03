
## Problem

Two related issues:

1. **CSP blocks PDF worker**: The `pdfjs` worker is loaded from `unpkg.com`, which is not in the `script-src` CSP directive in `customHttp.yml`. Production blocks it, causing the PDF to fall back to a "fake worker" (slower, potentially broken).

2. **Preview disappears**: When the PDF worker fails and `react-pdf` can't render the document, the `PdfPageView` component shows "Preview unavailable". This likely cascades — the preview briefly shows the thumbnail fallback, then switches to the PDF path (because `pdfSources` is set), which fails.

## Fix

### 1. Bundle the PDF worker locally instead of loading from CDN

Copy the `pdfjs-dist` worker file to `public/` at build time, and reference it with a local path. This avoids CSP issues entirely.

**In `PdfPageView.tsx`**, change line 8 from:
```ts
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
```
to:
```ts
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
```

This uses Vite's `import.meta.url` resolution to bundle/reference the worker from `node_modules` directly, keeping it same-origin. The existing CSP already allows `worker-src 'self' blob:`.

### 2. No CSP changes needed

The `worker-src 'self' blob:` directive already permits same-origin workers and blob workers, so bundling locally is sufficient.

### 3. Verify thumbnail fallback still works

The thumbnail (image) path in `LooseSheetsPreview` should continue working when no `pdfSource` is provided. No changes needed there.

## Files changed
- `src/components/preview/PdfPageView.tsx` (line 8 — worker source)
