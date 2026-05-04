
## Issues

### 1. "Couldn't trim file — Could not generate download URL"
When using "Use first 2 pages" on a 10-page business card PDF, the trim operation fails because `getDownloadUrls` returns no URL. This likely happens when the document hasn't finished uploading/processing yet, or the `file_path` is empty/null at the time the trim is triggered.

**Fix**: Add a guard in `trimDocumentToFirstPages` to wait briefly or provide a clearer error. Also check the calling code in `OrderFiles.tsx` to ensure `file_path` is available before attempting to trim.

### 2. Preview still showing MediaBox (crop marks visible)
The CSS-based `trimCrop` clipping was implemented but the crop marks are still visible (screenshot 2). The user is right to ask: "can't the PDF viewer just choose the box?"

**Answer**: No — pdf.js does not support selecting TrimBox/CropBox for rendering. The `page.view` property returns CropBox (or MediaBox if none), and `getViewport()` has no box-selection parameter. CSS clipping is the correct approach.

**Root cause**: The `trimCrop` calculation (lines 666-684 of `PreviewPanel.tsx`) relies on `preflight_data.trim_box_pt` being populated. If preflight hasn't stored this field, `trimCrop` will be `undefined` and no clipping occurs. Additionally, the crop math may have a bug — the PDF coordinate system is bottom-up, so the `top` offset calculation needs verification.

### Files to change

**`src/components/order/PreviewPanel.tsx`**
- Debug/fix the `trimCrop` calculation: verify the coordinate math (PDF bottom-up y-axis) and add a fallback that reads CropBox if TrimBox is absent
- Add console logging (temporary) to trace whether `trim_box_pt` is present in preflight data

**`src/lib/trimPdfPages.ts`**
- Add a retry or better error handling when `getDownloadUrls` returns no URL (the file may still be uploading)

**`src/pages/dashboard/OrderFiles.tsx`**
- Guard the trim call: ensure the document's `file_path` is non-empty before calling `trimDocumentToFirstPages`

**`src/components/preview/LooseSheetsPreview.tsx`**
- Verify the CSS clip container dimensions are correct when `trimCrop` is active — the inner `PdfPageView` must be sized to the full MediaBox proportions, not the trim proportions
