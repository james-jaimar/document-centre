

# Plan: Handle 4-Page PDFs for Folded Brochures

## Problem

Graphic designers often supply brochures as 4-page PDFs where each page is one panel:
- Page 1 = Outside front panel
- Page 2 = Inside front panel  
- Page 3 = Inside back panel
- Page 4 = Outside back panel

The current auto-assign only handles 2-page PDFs (page 1 → Outside surface, page 2 → Inside surface). A 4-page PDF needs its pages **composed** into two sheet surfaces before the fold preview can display them.

## Solution

### 1. Detect page count and offer appropriate auto-assign options

**`src/components/order/SectionActions.tsx`**
- When `selectedFilePageCount >= 4` and fold type has the matching panel count, show a new button: **"Auto-assign panels (4-page layout)"**
- Keep the existing 2-page auto-assign for 2-page docs
- For 4-page bi-fold docs: pages 1,4 → Outside, pages 2,3 → Inside

### 2. Map panels to sheet surfaces

**`src/pages/dashboard/OrderFiles.tsx`**
- New handler `handleAutoAssignPanels` that creates two sections, each with metadata indicating which pages compose that surface:
  - For bi-fold (4 pages): Outside = pages [0, 3], Inside = pages [1, 2]
  - For tri-fold (6 pages): Outside = pages [0, 1, 2], Inside = pages [3, 4, 5]
- Store the page list in `page_range_start` as the first page and add a `page_range_end` or use a JSON field to capture the panel-to-surface mapping

### 3. Compose panel thumbnails into sheet surfaces

**`src/components/order/PreviewPanel.tsx`**
- When a fold section has multiple page indices (panel-per-page layout), render those thumbnails side-by-side on a canvas to produce a single composite surface URL
- Use an in-browser `<canvas>` to stitch panel thumbnails into one image per surface
- Cache the composed result so it doesn't re-render on every state change

### 4. Update FoldPreview to accept composed surfaces

**`src/components/preview/FoldPreview.tsx`** — no changes needed. It already expects `urls[0]` = outside, `urls[1]` = inside as full sheet images. The composition happens upstream.

## Data model consideration

The `document_sections` table has `page_range_start` (integer). For multi-panel mapping we need to know which pages belong to each surface. Options:
- Use `page_range_start` + `page_range_end` to define a range (works for contiguous pages like tri-fold)
- For non-contiguous (bi-fold: pages 0,3 for outside), store a JSON array in a metadata field or use a convention: `page_range_start=0, page_range_end=3` meaning "pages 0 and 3" for bi-fold specifically

Simplest approach: use `page_range_start` and `page_range_end` as range bounds, and let the composition logic use the fold type to determine the correct panel ordering within that range.

## Changes

| File | Change |
|------|--------|
| `src/components/order/SectionActions.tsx` | Add "Auto-assign panels" button when page count matches fold panel count × 2 |
| `src/pages/dashboard/OrderFiles.tsx` | Add `handleAutoAssignPanels` that maps pages to surfaces based on fold type |
| `src/hooks/useOrderBuilder.ts` | Add `page_range_end` to section mutation input |
| `src/components/order/PreviewPanel.tsx` | Compose multi-panel thumbnails into single surface images using canvas |
| `src/lib/thumbnailUtils.ts` | Add `composePanelImages(urls[], geometry)` utility that stitches panel thumbnails into one image |

## Implementation order
1. Add `page_range_end` support to data model
2. Add panel auto-assign handler and UI button
3. Build canvas composition utility
4. Wire composition into PreviewPanel's fold thumbnail logic

