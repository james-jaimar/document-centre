# White cover graphics still missing — second, real cause

The previous fix added a guard that skips the "knock out white" pass when the rasterised page already has transparency. That guard is correct, but on the browser side it can never fire.

Confirmed in the installed renderer (`node_modules/pdfjs-dist/build/pdf.mjs`): before drawing, pdf.js fills the canvas with `background || "#ffffff"`. We never pass a `background`, so every rasterised page comes back **fully opaque white** — zero transparent pixels. The guard samples the alpha channel, finds 0% clear, and lets the knockout run, which erases the template's white "2027 / ANNUAL CALENDAR" type exactly as before. Re-uploading the PDF changes nothing because the loss happens at raster time, not at upload.

The server side is fine: `templated_artwork_assembly.py` renders via `mutool draw -c rgba`, so it keeps real alpha and the guard there does work.

## Fix

`src/lib/artworkTemplates/pdfPages.ts` — in `rasterisePdfPages`, pass a transparent background to the render call:

```ts
await page.render({ canvasContext: ctx, viewport, canvas, background: "rgba(0,0,0,0)" }).promise;
```

With that, a template exported without a white background rectangle rasterises transparent, the existing alpha guard fires, the knockout is skipped, and the white type survives. Templates that *do* carry a painted white background rectangle still come back opaque, the guard does not fire, and the knockout behaves exactly as it does today — so deskpads are unaffected.

## Verification

- Cover page of the 2027 calendar: white type visible in the builder canvas, the proof modal and the downloaded PDF proof.
- An existing A2 deskpad template: preview and knockout unchanged.

No schema, admin UI, pricing or PDF-server changes.
