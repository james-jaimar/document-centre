## Problem

In production (Amplify), the console shows:

```
/assets/pdf.worker.min-qwK7q_zL.mjs
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".
```

Amplify's default SPA rewrite rule doesn't whitelist `.mjs`, so the hashed worker asset gets rewritten to `index.html`. PDF.js therefore never initialises, `PdfPageView` never renders, and `LooseSheetsPreview` falls back to the low‑res raster thumbnail (line 195 of `LooseSheetsPreview.tsx`). Business cards feel worst because their thumbnails are lowest DPI, but the same failure hits every PDF preview.

## Fix (code‑only, no Amplify console change needed)

Load the worker as a bundled string and serve it from a blob URL. Our CSP already allows `worker-src 'self' blob:`, so this works in production without touching Amplify rewrites or CSP.

**`src/components/preview/PdfPageView.tsx`** — replace the current worker init:

```ts
// before
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// after — inline the worker so no .mjs asset is fetched from the origin
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
const workerBlob = new Blob([pdfWorkerSource], { type: "application/javascript" });
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
```

Vite's `?raw` import inlines the worker into the main JS bundle, so there's no separate `.mjs` request for Amplify's rewrite to swallow.

## Verification

1. Build and open the same order URL in production (or preview) and check console — the `pdf.worker.min-*.mjs` MIME error should be gone.
2. Open a business card lightbox → should render the high‑res PDF (crisp text), not the pixelated thumbnail.
3. Sanity‑check other PDF previews (loose sheets, brochures) still render correctly.

## Out of scope

- No changes to `OrderFiles.tsx`, `PreviewLightbox.tsx`, `LooseSheetsPreview.tsx`, or the fallback logic — those were already correct.
- No Amplify rewrite / CSP changes. (If we later prefer a separate worker asset, we'd add an `.mjs` exclusion in the Amplify console rewrite rule, but that's an infra change we can defer.)
