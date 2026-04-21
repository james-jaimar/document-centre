

## Wire Up Print Colour/Size to Job Summary and PDF Server Processing

### Problem

Two gaps exist:

1. **Display**: The job detail panel shows per-section colour/duplex info buried in "Document Sections" but lacks a top-level "Print Colour" summary line (like the reference system's clean "Print Colour: Black & White" row).

2. **Processing**: When a customer selects B&W or a non-native document size, this is stored as metadata only. The actual PDF files are never converted to grayscale or resized via the Document Centre API -- the `grayscale()` and `resize()` functions exist in `documentCentreApi.ts` but are never called.

### Changes

**1. Add top-level Print Colour and Print Sides to the job snapshot**

**`src/lib/orders/buildJobSnapshot.ts`**
- After building the "Document Sections" config section, derive a top-level "Print Colour" summary:
  - If all sections are B&W -> "Black & White"
  - If all sections are Colour -> "Full Colour"
  - If mixed -> "Mixed (Colour + B&W)"
- Same logic for Print Sides: "Simplex" / "Duplex" / "Mixed"
- Insert these as items in a new "Print Colour" config section (placed after "Paper & Print" in the section order), so they render prominently in `JobDetailPanel`

**2. Trigger PDF server processing at order placement**

**`src/hooks/useCart.ts`** (in `usePlaceOrder`)
- After building the job snapshot but before calling `order-engine`, loop through each item's document sections
- For each section where `is_color === false` (B&W), call `grayscale(assetId)` on the document's backend asset
- For each document where the selected size differs from the document's native dimensions, call `resize(assetId, targetWidthMm, targetHeightMm)`
- These operations create new derived files on the PDF server -- store the resulting asset paths in `production_specs` on the job

**`src/lib/orders/mutations.ts`**
- Add a `processDocumentForProduction` helper that orchestrates the grayscale/resize calls and polls for completion

**3. Size comparison logic**

**`src/lib/paperSizes.ts`**
- Add a `getTargetDimensions(sizeSlug: string)` helper that returns `{ widthMm, heightMm }` for known size slugs (A4, A3, A5, Letter, etc.)
- Used to compare against `document.page_width_mm` / `page_height_mm` to determine if resizing is needed

### Files changed

| File | Change |
|------|--------|
| `src/lib/orders/buildJobSnapshot.ts` | Derive top-level "Print Colour" and "Print Sides" summary from sections |
| `src/hooks/useCart.ts` | Call grayscale/resize on documents during order placement |
| `src/lib/orders/mutations.ts` | Add `processDocumentForProduction` orchestration helper |
| `src/lib/paperSizes.ts` | Add `getTargetDimensions` size lookup helper |

### Technical notes

- Grayscale and resize operations are already implemented on the Document Centre API and exposed via `documentCentreApi.ts` -- this wires them into the order flow
- Processing runs client-side during checkout (before the order-engine call) so it can show progress feedback
- The `production_specs` JSONB field on `order_jobs` stores the processed asset references for downstream production use
- If processing fails, the order still proceeds with the original files (graceful degradation) -- a warning is logged but the order is not blocked
- The preview already applies CSS `grayscale(100%)` for B&W sections visually; this change makes the actual PDF match

