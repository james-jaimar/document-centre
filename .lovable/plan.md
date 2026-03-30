

# Paper Size Detection & Scaling Advisory

## Problem
When users upload documents with non-standard sizes (e.g. US Letter 216×279mm), the system silently accepts them. In South Africa (and most of the world outside the US), standard sizes are ISO A-series. Users often don't realise their document is US Letter and would prefer to print on A4.

## How it works

### 1. Detect non-ISO sizes after upload processing
In `src/hooks/useDocumentUpload.ts`, after the document's `page_width_mm` and `page_height_mm` are known (line ~175), check if the dimensions match a known non-ISO size (US Letter, US Legal, US Tabloid, etc.) rather than an A-size.

A simple lookup table with ±2mm tolerance:
```text
US Letter: 216 × 279
US Legal:  216 × 356
US Tabloid: 279 × 432
```

If a match is found, store a flag on the document row (e.g. `preflight_data.detected_size: "US Letter"`).

### 2. Show an advisory dialog
Create a new component `src/components/order/PaperSizeAdvisory.tsx` — a dialog that:
- Tells the user: "This document is US Letter size (216 × 279mm)"
- Explains this is not a standard local size
- Offers choices:
  - **Keep original size** — print as-is (may require custom paper cutting, possible surcharge)
  - **Scale to A4 (210 × 297mm)** — proportionally scale to fit A4
  - **Scale to A3 / A5** — other A-size options if relevant

### 3. Trigger the dialog
In `src/pages/dashboard/OrderFiles.tsx`, after documents finish processing, check if any document has a detected non-ISO size. If so, show the `PaperSizeAdvisory` dialog automatically.

### 4. If user chooses to scale
- Call the existing `resize()` function in `src/lib/documentCentreApi.ts` with the target A-size dimensions and `fit_mode: "fit"` (proportional scaling)
- Re-fetch thumbnails after the resize operation completes
- Update the document's `page_width_mm` / `page_height_mm` to the new size
- Update the `Document Size` option in the spec to match the chosen size

### 5. If user keeps original size
- Auto-select "US Letter" in the Document Size option (if available)
- No resize needed

## Files to create/edit
- **Create** `src/components/order/PaperSizeAdvisory.tsx` — advisory dialog with size options
- **Edit** `src/hooks/useDocumentUpload.ts` — detect non-ISO sizes after preflight, store in preflight_data
- **Edit** `src/pages/dashboard/OrderFiles.tsx` — trigger advisory dialog when non-ISO documents are detected
- **Edit** `src/pages/dashboard/OrderBuild.tsx` — if user reaches Step 2 without resolving, show a banner reminder

