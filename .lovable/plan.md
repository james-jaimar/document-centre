

# Plan: Image Upload Size Selector

## Problem

When users upload images, they're converted to PDF at the image's native pixel dimensions (assuming 72 DPI), producing arbitrary sizes like 706×499mm. For products like posters, flyers, and loose pages, users need to specify their desired output size before conversion.

## Solution

Add a size selection dialog that appears when image files are dropped/selected, before conversion and upload begins.

### Flow

1. User drops/selects image files
2. If any are images → show **ImageSizeDialog** with ISO size options (A5, A4, A3, A2) plus "Original size"
3. User picks a target size
4. `imageFileToPdf` receives the target size, scales the image proportionally to fit within the chosen dimensions (no cropping — letterboxed with white if aspect ratios differ)
5. Resulting PDF proceeds through the normal upload pipeline

### Changes

| File | Change |
|------|--------|
| `src/components/order/ImageSizeDialog.tsx` | **New** — Dialog showing ISO size options with aspect ratio fit preview. Shows whether image will fill exactly or be scaled to fit with white margins. Radio/card selector for A5/A4/A3/A2/Original. |
| `src/lib/imageToPage.ts` | **Modify** — Add optional `targetSize?: { widthMm: number; heightMm: number }` param to `imageFileToPdf`. When provided, create PDF at target size and scale image proportionally to fit (centered, no crop). When absent, keep current behaviour. |
| `src/pages/dashboard/OrderFiles.tsx` | **Modify** — Intercept `handleFiles`: separate images from PDFs. If images exist, show `ImageSizeDialog`. On confirm, pass chosen size through to upload. PDFs bypass the dialog. |
| `src/hooks/useDocumentUpload.ts` | **Modify** — Pass target size through to `imageFileToPdf` call. Add optional `targetSize` param to `uploadFile`. |

### ImageSizeDialog Design

- Modal with title "Choose Output Size"
- Shows image preview thumbnail
- Cards for each ISO size showing dimensions
- "Original Size" option with calculated mm at 72 DPI
- Fit indicator: "Image will be scaled to fit — small white margins on sides" or "Perfect fit" if aspect ratios match within tolerance
- Portrait/Landscape auto-detected from image, sizes shown in matching orientation
- "Continue" button

### Scale-to-Fit Logic in `imageFileToPdf`

```text
Given target W×H mm and image w×h px:
  scale = min(W / (w * PX_TO_MM), H / (h * PX_TO_MM))
  scaledW = w * PX_TO_MM * scale
  scaledH = h * PX_TO_MM * scale
  offsetX = (W - scaledW) / 2
  offsetY = (H - scaledH) / 2
  → Create PDF page at W×H, place image at offset, centered
```

### Implementation Order
1. Update `imageFileToPdf` to accept and apply target size
2. Create `ImageSizeDialog` component
3. Wire dialog into `OrderFiles.tsx` handleFiles flow
4. Pass target size through `useDocumentUpload`

