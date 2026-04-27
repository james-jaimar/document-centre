## Goal

Give the user as much screen real estate as possible for the flip-book preview on the Configure Your Document step (`/t/:slug/orders/:id/build`), without breaking other pages.

## Changes

### 1. Reclaim vertical space on the build page
File: `src/pages/dashboard/OrderBuild.tsx`

- Change the page's outer wrapper from `h-full flex flex-col` to a min-height layout that lets the footer fall *below* the viewport. The page itself will fill the viewport (`min-h-[calc(100vh-...)]`) so the preview gets the full window height; if the user wants the footer they just scroll down. No layout-level changes are needed — the footer stays where it is in `CustomerLayout`, it just sits below the fold because the build page now claims the full visible area.
- Tighten the header section (smaller title + description) to recover ~30px.

Net effect: matches what the user sees today at 67% browser zoom, but at 100%.

### 2. Widen the options column
File: `src/pages/dashboard/OrderBuild.tsx` (line 745 grid)

Current:
```
lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr]
```

New:
```
lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] 2xl:grid-cols-[460px_1fr]
```

A wider left column means the option labels and selected-value chips have room to breathe, and (more importantly) the right-hand preview area also grows proportionally on wide screens because the grid keeps it at `1fr`.

### 3. Make the inline preview fill its panel
File: `src/components/order/PreviewPanel.tsx`

- Reduce the surrounding panel padding from `p-4` to `p-2` (in `OrderBuild.tsx` line 798) so the FlipBook itself uses more of the available pixels.
- The preview already measures its container via `ResizeObserver`, so widening the column + trimming padding automatically scales the flip-book up.

### 4. True full-screen lightbox
File: `src/components/order/PreviewLightbox.tsx`

- Bump the preview size from `window.innerWidth * 0.85` / `innerHeight * 0.8` to `0.95` / `0.92`.
- Remove the hard `1200px` cap so the flip-book uses the actual viewport on large monitors.
- Move the close/prev/next buttons slightly inward so they don't overlap the larger canvas.

## Out of scope

- No changes to the footer component itself (still rendered, just below the fold).
- No changes to FlipBook/preview internals — they already auto-size to their container.
- No changes to the sidebar (already auto-collapses on this page).

## Files touched

- `src/pages/dashboard/OrderBuild.tsx` — outer wrapper height, header tightening, grid template, preview panel padding
- `src/components/order/PreviewLightbox.tsx` — lightbox dimensions
