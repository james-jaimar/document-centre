

# Add Document Preview Thumbnail + Lightbox & Make Lists More Compact

## What we're building

Inspired by the Mimeo reference screenshots, three changes:

1. **Larger thumbnail preview** between the file list and section actions in the middle column — shows the first page of the currently selected file/section so the user gets immediate visual feedback
2. **Clickable lightbox overlay** — clicking that larger thumbnail opens a semi-transparent fullscreen overlay with page-by-page navigation (left/right arrows), similar to Mimeo's preview modal
3. **More compact file and section list items** — reduce padding, thumbnail sizes, and spacing so 5-6 files fit comfortably without scrolling off the page

## Layout change

The current middle column only has `SectionActions`. We'll restructure it to show:

```text
┌─────────────────┐
│  Selected File   │
│  Thumbnail       │  ← ~200px tall A4 aspect ratio
│  (clickable)     │
│                  │
│  "24 Pages"      │
│  "Letter Size"   │
├─────────────────┤
│  Section Actions │
│  (existing)      │
└─────────────────┘
```

## Files to change

### 1. `src/components/order/DocumentPreviewThumb.tsx` (new)
- Medium-sized thumbnail component showing the selected document's first page
- Displays page count + dimensions below the thumbnail
- Clickable — opens lightbox on click
- Uses `useSignedThumbnailUrl` for the image
- Shows placeholder when no file is selected

### 2. `src/components/order/PreviewLightbox.tsx` (new)
- Full-screen semi-transparent overlay (dark backdrop)
- Large page preview in the center (reuses `PreviewImage` pattern with signed URLs)
- Left/right navigation arrows + page counter
- Close button (X) top-right
- Builds a flat page list from the selected document's thumbnails
- Keyboard support: arrow keys to navigate, Escape to close

### 3. `src/pages/dashboard/OrderFiles.tsx`
- Import and place `DocumentPreviewThumb` above `SectionActions` in the middle column
- Pass the selected document (from either `selectedDocId` or `selectedSectionId`) to the preview thumb
- Add state for lightbox open/close

### 4. `src/components/order/FileList.tsx` — make compact
- Reduce item padding from `p-3` to `p-2`
- Reduce thumbnail from `h-12 w-9` to `h-9 w-7`
- Reduce file name text from `text-sm` to `text-xs`
- Reduce gap from `gap-3` to `gap-2`
- Tighten the upload progress items similarly

### 5. `src/components/order/SectionList.tsx` — make compact
- Reduce item padding from `p-3` to `p-2`
- Reduce thumbnail from `h-14 w-10` to `h-10 w-7`
- Reduce spacing between section items

## Technical details

- The lightbox will use a portal (`createPortal`) or a simple fixed-position div with `z-50`
- Navigation arrows use the same `ChevronLeft`/`ChevronRight` icons
- The backdrop uses `bg-black/70` with `backdrop-blur-sm` for the semi-transparent effect
- All thumbnail images continue to use `useSignedThumbnailUrl` from `thumbnailUtils.ts`
- The selected document for the middle preview is determined by: if a file is selected in the left panel, show that file; if a section is selected in the right panel, show that section's document

