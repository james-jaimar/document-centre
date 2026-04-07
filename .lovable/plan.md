

# Plan: Add Fullscreen Toggle to Preview Panel

## What
Add a fullscreen button to the PreviewPanel that opens the existing `PreviewLightbox` component with all current page data, effects, and product type. The lightbox already renders a full-viewport `DocumentPreview` — we just need to wire it up.

## Changes

### `src/components/order/PreviewPanel.tsx`
1. Import `PreviewLightbox` and the `Maximize2` icon from lucide-react
2. Add `lightboxOpen` state (boolean, default false)
3. Add a fullscreen button (Maximize2 icon) in the top-right corner of the preview container
4. When open, render `<PreviewLightbox>` passing `thumbnailPaths`, `currentPage`, `productType`, and `onClose`
5. On lightbox close, sync the page back from lightbox to the panel's `currentPage`

### `src/components/order/PreviewLightbox.tsx`
1. Add `effects`, `bindingEdge`, `pageAspectRatio`, `colorFlags`, `sectionTypes`, `pageRoles`, `bleedFlags`, `pageLabels`, `pageColors`, `tabPositions`, `displayPageNumbers` as optional props — pass them through to `DocumentPreview`
2. Add a page counter and nav arrows that step by 2 for bound types (matching PreviewPanel behavior)
3. On close, call `onClose(currentPage)` so the parent can sync position

### Files
| File | Change |
|------|--------|
| `src/components/order/PreviewPanel.tsx` | Add fullscreen button + lightbox state |
| `src/components/order/PreviewLightbox.tsx` | Accept all DocumentPreview props, sync page on close |

