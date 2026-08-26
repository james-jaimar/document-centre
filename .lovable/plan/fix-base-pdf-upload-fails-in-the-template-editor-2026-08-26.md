# Fix: base PDF upload fails in the template editor

## What's happening

Uploading a base PDF in the Deskpad template editor throws:

`Setting up fake worker failed: "Failed to fetch dynamically imported module: https://document-centre.com/assets/pdf.worker-9aISQa3R.mjs"`

The PDF engine loads a separate worker file. On the live site (Amplify) the SPA rewrite does not whitelist `.mjs`, so that worker file is served back as the HTML page instead of JavaScript, and loading fails.

This is already solved in one place: the page-preview component inlines the worker into the main bundle and runs it from a blob URL (with a comment explaining exactly this Amplify rewrite issue). The template editor path and the canvas-prints path still use the separate-file approach and therefore break in production.

## The fix

Create one shared worker setup module and use it everywhere, so all PDF features load the worker the same, production-safe way.

- New `src/lib/pdfWorkerSetup.ts`: imports the worker source inline (`?raw`), creates a blob URL once, sets it on pdf.js `GlobalWorkerOptions`, and exports the URL.
- `src/lib/artworkTemplates/pdfPages.ts` (template editor base-PDF rasterising): drop the `?url` import, import the shared setup instead.
- `src/lib/canvasPrints/pdfToImage.ts`: same change (same latent bug).
- `src/components/preview/PdfPageView.tsx`: switch to the shared setup so there is a single copy of the worker logic and only one blob URL created.

No behaviour changes beyond the worker source; rendering, box placing and uploads stay as they are.

## Verification

- Load the Deskpad template editor in preview, upload a base PDF, confirm pages rasterise and boxes can be drawn.
- Confirm existing PDF page previews and canvas-print PDF uploads still render.
