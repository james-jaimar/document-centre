
# Fit/Fill Toggle for Posters, Flyers, and Business Cards

## Scope

The PDF-on-canvas preview is already working for all static/loose types. This plan adds a **fit/fill toggle** for three product types only:

- **Posters** (`poster`)
- **Flyers** (falls through to `loose_sheets` via slug)
- **Business Cards** (`business_cards`)

NOT for stapled/loose bound documents or any bound/fold types.

The chosen scale mode must be **persisted** on the order item so the print-ready PDF can be rendered at the customer's chosen scaling.

---

## Changes

### 1. Add `scale_mode` to `ItemSpec`

**`src/lib/calculatePrice.ts`**
- Add optional field `scale_mode?: "fit" | "fill"` to the `ItemSpec` interface.
- This is persisted as part of the order item's `spec` JSONB column -- no DB migration needed.

### 2. Create `ScaleModeToggle` component

**`src/components/preview/ScaleModeToggle.tsx`** (new)
- Small segmented toggle: **Fit** / **Fill**, using the existing `ToggleGroup` / `ToggleGroupItem` from `@/components/ui/toggle-group`.
- Icons: `Minimize2` (fit) and `Maximize2` (fill).
- Emits `onChange(mode: "fit" | "fill")`.
- Only renders when there is a size mismatch between canvas and PDF (i.e. when the toggle is meaningful).

### 3. Wire toggle into `PreviewPanel`

**`src/components/order/PreviewPanel.tsx`**
- Accept new props: `scaleMode`, `onScaleModeChange`, and `productFamilySlug` (to determine whether to show the toggle).
- Determine eligibility: show the toggle when `productFamilySlug` matches poster/flyer/business-card slugs **AND** `canvasSizeMm` differs from `pdfSizeMm`.
- Render `ScaleModeToggle` in the preview toolbar area (near the page navigation controls).
- Pass `scaleMode` down to `LooseSheetsPreview`.

### 4. Implement fill scaling in `LooseSheetsPreview`

**`src/components/preview/LooseSheetsPreview.tsx`**
- Accept `scaleMode?: "fit" | "fill"` prop (default `"fit"`).
- When `scaleMode === "fill"` and there is a size mismatch:
  - Scale the PDF to **cover** the canvas (inverse of fit logic).
  - Wrap the `PdfPageView` in a container with `overflow: hidden` to crop the overflow.
- When `scaleMode === "fit"`: current behaviour (PDF fits inside canvas, white margins visible).

### 5. Manage state and persistence in `OrderBuild`

**`src/pages/dashboard/OrderBuild.tsx`**
- Read `spec.scale_mode` as initial state for the toggle.
- On toggle change, update `spec` via `setSpec(prev => ({ ...prev, scale_mode: mode }))`.
- This automatically gets persisted when the user saves (existing save flow writes `spec` to the order item).
- Pass `scaleMode` and `onScaleModeChange` to `PreviewPanel`.
- Pass `productFamily?.slug` to `PreviewPanel` so it can determine toggle eligibility.

### 6. Update type definitions

**`src/components/preview/previewTypes.ts`**
- Add `scaleMode?: "fit" | "fill"` to `PreviewComponentProps`.

---

## Technical Detail: Fill Scaling

```text
if (scaleMode === "fill") {
  if (pdfAspect > canvasAspect) {
    // PDF is wider -> fit to height, crop sides
    pdfH = canvasHeight;
    pdfW = canvasHeight * pdfAspect;
  } else {
    // PDF is taller -> fit to width, crop top/bottom
    pdfW = canvasWidth;
    pdfH = canvasWidth / pdfAspect;
  }
  // Parent container clips overflow
}
```

The canvas wrapper div uses `overflow: hidden` in fill mode to cleanly crop the overflowing PDF content.

---

## Persistence for Print Output

The `scale_mode` field lives in `ItemSpec.spec` JSONB, which is already snapshotted into `order_pricing_snapshots` and `order_jobs`. When the print operator requests the final PDF, the rendering pipeline reads `spec.scale_mode` to apply the same fit or fill transformation, ensuring the print output matches what the customer saw in the preview.
