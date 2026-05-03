I’ll make these as a focused housekeeping pass, with one important note: the booklet blank-page requirement needs both app changes and PDF server changes, because the actual saved/production PDF must be padded to a multiple of 4 — not just visually faked in the preview.

Plan:

1. Fix auto tab labels in the drawer
- Update the tab auto-insert flow so each created tab is explicitly saved with the correct label: `Tab 1`, `Tab 2`, `Tab 3`, etc.
- Sort displayed tab rows by their physical anchor/page position so the labels and colours stay aligned with the preview.
- Ensure the drawer uses `page_range_start` as the true “After Page N” value, not `sort_order`, so the display cannot drift into `Tab 1, Tab 1, Tab 3, Tab 3, Tab 5`.

Files:
- `src/components/order/TabInsertDrawer.tsx`
- `src/pages/dashboard/OrderBuild.tsx`
- possibly `src/hooks/useOrderBuilder.ts` to allow label/color fields when creating tab sections.

2. Fix hole punch marks on reverse/even faces
- Adjust the preview renderer so punch holes are shown on the left for front/odd faces and on the right for reverse/even faces.
- The current code already does this for explicit back roles like `blank_back`, but not for duplex content pages. I’ll make it also account for the physical face index/page parity.
- Apply the same rule anywhere `PageEffects` is used so loose sheets, bound documents, and saved order previews agree.

Files:
- `src/components/preview/PageEffects.tsx`
- `src/components/preview/LooseSheetsPreview.tsx`
- `src/components/preview/FlipBook.tsx` / related preview components if they are the call sites passing page roles.

3. Make booklets physically correct: pad to multiples of 4
- For saddle-stitched/booklet products, add real blank pages until the page count is divisible by 4.
- Example: a 10-page PDF becomes a 12-page PDF with blank pages 11 and 12.
- The live preview will show those blanks as real white pages, and page numbering will reflect `Page 11` / `Page 12` rather than silently ending at 10.
- The saved preview snapshot used after order placement will use the same padding logic.
- The PDF server will get a proper “pad pages to multiple of 4” step so the normalized production PDF itself is saved with those blank pages. This is necessary for future booklet imposition/download to work correctly.

Frontend files:
- `src/components/order/PreviewPanel.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`
- `src/hooks/useDocumentUpload.ts`
- `src/pages/dashboard/OrderFiles.tsx` or `OrderBuild.tsx` if an existing unpadded booklet needs correcting before configure/add-to-cart.

PDF server files:
- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/schemas/assets.py`
- `pdf-server/app/tasks/operation_tasks.py`
- `pdf-server/app/web/routes.py`
- `src/lib/documentCentreApi.ts`

4. Add business card “Auto-assign Front + Back”
- Reuse the flyer pattern for business cards.
- If the selected business-card PDF has 2+ pages, show `Auto-assign Front + Back`.
- It will create:
  - Front section: page 1 only (`page_range_start = 0`, `page_range_end = 0`)
  - Back section: page 2 only (`page_range_start = 1`, `page_range_end = 1`)
- This avoids manually assigning the same 2-page file twice.

Files:
- `src/components/order/SectionActions.tsx`
- `src/pages/dashboard/OrderFiles.tsx`

5. Properly use TrimBox for business-card configure preview
- The current thumbnail/upload stage can show the TrimBox correctly, but the configure preview’s inline PDF renderer is still rendering the full PDF page/media canvas.
- I’ll make the configure preview use the same finished-size geometry as upload:
  - prefer `TrimBox`
  - fallback to `CropBox`
  - then `MediaBox`
- For business cards, if the raw PDF has bleed/crop marks but a valid TrimBox, the preview canvas and rendered content should be 90×50mm, not the oversized media box.
- If PDF.js cannot directly render the TrimBox region cleanly from the source PDF, I’ll route business-card configure preview to the server-generated trimmed thumbnails instead of the raw inline PDF. That is safer because those thumbnails are already crop-rendered correctly.

Files:
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/LooseSheetsPreview.tsx`
- `src/components/preview/PdfPageView.tsx` only if needed for box-aware PDF rendering.

6. Keep page counts and pricing honest after booklet padding
- When booklet padding adds blank pages, update the document row/page count so the app, cart, pricing, order snapshot, and operator-facing job data all agree.
- Avoid hidden/phantom pages: the blank pages are real booklet pages and should be represented consistently.

Validation after implementation:
- Ring binder with 5 auto tabs: drawer shows `Tab 1` through `Tab 5` and preview colours/labels match.
- Loose sheets with 2-hole/4-hole punching: front faces show left holes, reverse/even faces show right holes.
- 10-page booklet: configure preview shows 12 pages, with pages 11 and 12 blank; saved PDF/page count is 12.
- 2-page business card: `Auto-assign Front + Back` appears and assigns page 1/front, page 2/back.
- Business-card configure preview uses the finished TrimBox (90×50mm) rather than the full media/crop-mark canvas.