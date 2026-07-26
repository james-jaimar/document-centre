## Problem

The order-files lightbox now renders the real PDF (previous fix worked) but it shows the **entire MediaBox** — crop marks and bleed visible — instead of clipping to the TrimBox. The customer should only see the trimmed printed area.

## Suspected cause (to verify before fixing)

Both `OrderFiles.tsx` (`lightboxTrimCrop`) and `PreviewPanel.tsx` (`trimCrop`) build the CSS clip from `preflight.boxes.MediaBox` + `TrimBox`, but then apply a "double-crop guard" that returns **undefined** whenever `page_width_mm/page_height_mm ≈ TrimBox size`. That guard was written assuming: *"if the doc's stored page size matches the TrimBox, the PDF we're about to render must already be the server-cropped/processed file, so a second CSS clip would over-crop."*

That assumption breaks when we fall back to the **original** upload:

- `lightboxPdfPath = preflight.processed_file_path || file_path`
- `page_width_mm` in the DB is stored from preflight as the **TrimBox** size (that's how business cards are recorded).
- If `processed_file_path` is missing/expired, we render the **original** PDF (which still has MediaBox + crop marks), but the guard still sees `page_width_mm ≈ trim` and skips clipping → the whole MediaBox is shown.

This matches the screenshot (dog-behaviourist business card with visible crop marks at all four corners).

## Plan

1. **Verify the cause first (no code changes yet).** For the order shown in the screenshot, check `order_documents.preflight_data` to confirm:
   - `boxes.MediaBox` and `boxes.TrimBox` are present and differ.
   - `preflight_data.processed_file_path` is **absent** (or points to a missing/expired object) so the lightbox falls back to `file_path`.
   - `page_width_mm/page_height_mm` match the TrimBox dimensions.
   Only proceed to the fix once this is confirmed.

2. **Fix the guard** in `src/components/order/PreviewPanel.tsx` and `src/pages/dashboard/OrderFiles.tsx` (and mirror the change in `src/lib/orders/previewFallbacks.ts` `getTrimCrop`):
   - Track which file is actually being rendered (processed vs original) by reading `preflight.processed_file_path` alongside `file_path`.
   - Only skip the CSS TrimBox clip when the URL being rendered **is** the processed/trimmed file. When the render URL is the original upload, always honour the MediaBox→TrimBox crop even if `page_width_mm` happens to equal the TrimBox.
   - Keep the existing "mediaBox missing" and "trim within 1mm of media" early-outs.

3. **Verify visually.** Reload the order files page for the business-card order in the screenshot and confirm the lightbox now shows only the trimmed card (no crop marks, no bleed strip). Spot-check a bound document and a flyer to make sure the guard still correctly suppresses clipping when the processed file is really being rendered (no over-crop regression).

### Files touched (fix step)

- `src/components/order/PreviewPanel.tsx`
- `src/pages/dashboard/OrderFiles.tsx`
- `src/lib/orders/previewFallbacks.ts`

No schema, no backend, no snapshot-format changes.
