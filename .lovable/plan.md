

# Use Actual Document Dimensions for Preview Aspect Ratio

## Problem

The FlipBook currently hardcodes an A4 aspect ratio (0.707 = 210/297). When the uploaded PDF is US Letter (216×279mm, ratio ~0.774), the page holder doesn't match — white space appears at top/bottom because the container is taller than needed for Letter's proportions.

## Solution

Pass the document's actual `page_width_mm` and `page_height_mm` through the component chain and use that to calculate the aspect ratio instead of hardcoding A4.

## Changes

### 1. `src/components/order/PreviewPanel.tsx`
- Derive `pageAspectRatio` from the first document's `page_width_mm / page_height_mm` (falling back to 0.707 if not available)
- Pass it to `DocumentPreview` as a new `pageAspectRatio` prop

### 2. `src/components/preview/DocumentPreview.tsx`
- Accept `pageAspectRatio?: number` and pass it through to `FlipBook`, `FoldPreview`, and `LooseSheetsPreview`

### 3. `src/components/preview/previewTypes.ts`
- Add `pageAspectRatio?: number` to `PreviewComponentProps` (inherited by all preview types)

### 4. `src/components/preview/FlipBook.tsx`
- Replace the hardcoded `0.707` with `pageAspectRatio ?? 0.707` in the page sizing calculation (lines 47-58)

### 5. `src/components/preview/LooseSheetsPreview.tsx`
- Same: use `pageAspectRatio` instead of any hardcoded ratio

## Data flow

```text
Document.page_width_mm / page_height_mm
  → PreviewPanel (compute ratio)
    → DocumentPreview (pass through)
      → FlipBook / LooseSheetsPreview / FoldPreview (use for sizing)
```

No database changes. The dimension data already exists on every document record.

