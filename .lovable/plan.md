

# Flip Book Preview System — Deep Dive & Implementation Plan

## Research Findings

After evaluating the available libraries, the clear winner is **`react-pageflip`** (wrapper around StPageFlip):

- **45K weekly downloads**, MIT license, actively maintained
- Works with both canvas (images) and HTML block content
- CSS3 `transform-style: preserve-3d` with `perspective` for realistic 3D page turns
- Supports hard covers vs soft pages, drag-to-flip, click-to-flip, keyboard nav
- Shadow rendering during flip animation
- `size="stretch"` mode for responsive containers
- Simple API: wrap child divs, each child = one page

**Why not pure CSS?** Pure CSS flip books use checkbox hacks or complex keyframes — they don't support drag interactions, dynamic page counts, or programmatic control. StPageFlip handles all of this with a battle-tested canvas renderer.

**For folded products** (leaflets, tri-folds, gate-folds): No off-the-shelf library handles fold simulations. We'll build this with CSS 3D transforms (`transform-origin`, `rotateY`, `perspective`) on panels, which is straightforward for 2-panel (bi-fold), 3-panel (tri-fold), and Z-fold layouts.

## Architecture

```text
src/components/preview/
├── FlipBook.tsx          ← Bound documents (wire, comb, saddle, perfect)
├── FoldPreview.tsx        ← Folded products (bi-fold, tri-fold, z-fold, gate-fold)
├── LooseSheetsPreview.tsx ← Simple stack with slide animation
├── DocumentPreview.tsx    ← Router component: picks the right preview by product type
├── BindingSpine.tsx       ← Overlay for coil/wire/saddle spine graphics
└── previewTypes.ts        ← Shared types and fold geometry constants
```

## Detailed Plan

### 1. Install `react-pageflip`

Single dependency. It bundles `page-flip` (StPageFlip) internally.

### 2. Create `FlipBook.tsx` — Bound document preview

Uses `HTMLFlipBook` from react-pageflip. Each page is a `React.forwardRef` div containing the signed thumbnail image. Key props:

- `width` / `height` calculated from A4 aspect ratio to fit container
- `showCover: true` — first and last pages render as hard covers
- `flippingTime: 800` — smooth 0.8s page turn
- `drawShadow: true`, `maxShadowOpacity: 0.5`
- `startPage: 0`
- `size: "stretch"` for responsive fit
- `mobileScrollSupport: false` (prevent scroll interference)

The component receives the same `thumbnailPaths` array and uses `batchSignUrls` to resolve all URLs on mount (reusing existing cache infrastructure).

A `ref` exposes `pageFlip()` for programmatic navigation, connected to arrow buttons and keyboard shortcuts.

### 3. Create `BindingSpine.tsx` — Visual spine overlay

An absolutely-positioned div rendered at the center seam of the open book. Initially a simple CSS gradient simulating a spine shadow. Later, the user will provide actual graphics (coil, wire, saddle stitch) which will be swapped in via a `bindingType` prop:

```text
bindingType: "coil" | "wire" | "saddle" | "perfect" | "comb" | "none"
```

For now, renders a subtle shadow/groove effect at the spine. Graphics slots are ready for future assets.

### 4. Create `FoldPreview.tsx` — Folded product preview

Pure CSS 3D transforms, no library needed. Supports:

- **Bi-fold** (single vertical fold): 2 panels, `rotateY` on left panel
- **Tri-fold** (letter fold): 3 panels with staggered `rotateY` transforms
- **Z-fold**: 3 panels alternating fold direction
- **Gate-fold**: 4 panels, outer panels fold inward

Each fold type defines panel widths and transform origins. An animated toggle lets the user open/close the fold with a smooth transition (`transition: transform 0.8s ease-in-out`). The panels show the corresponding page thumbnails mapped to front/back faces using `backface-visibility: hidden` and `rotateY(180deg)` for the reverse.

### 5. Create `LooseSheetsPreview.tsx` — Simple stack

For loose sheets / posters: a single-page view with a subtle paper-stack shadow effect (multiple offset `box-shadow` layers). Navigation via arrows slides pages left/right with a CSS transition. Minimal — these products don't need flip effects.

### 6. Create `DocumentPreview.tsx` — Router component

Accepts a `productType` prop and delegates to the appropriate preview:

```typescript
switch (productType) {
  case "wire_bound":
  case "comb_bound":
  case "saddle_stitched":
  case "perfect_bound":
  case "ring_binder":
    return <FlipBook ... bindingType={productType} />;
  case "bi_fold":
  case "tri_fold":
  case "z_fold":
  case "gate_fold":
    return <FoldPreview ... foldType={productType} />;
  default:
    return <LooseSheetsPreview ... />;
}
```

### 7. Update `PreviewPanel.tsx` and `PreviewLightbox.tsx`

Replace the current static image display with `DocumentPreview`. The PreviewPanel (in-page) uses a compact size; the lightbox uses near-fullscreen dimensions. Both pass the same `thumbnailPaths` and `productType`.

## What stays the same

- All signed URL caching (`batchSignUrls`, `signedUrlCache`) — reused as-is
- Page data building from sections/documents — unchanged
- Upload flow and progress modal — unchanged

## Files to create/edit

1. **Install**: `react-pageflip` package
2. **Create**: `src/components/preview/previewTypes.ts`
3. **Create**: `src/components/preview/FlipBook.tsx`
4. **Create**: `src/components/preview/BindingSpine.tsx`
5. **Create**: `src/components/preview/FoldPreview.tsx`
6. **Create**: `src/components/preview/LooseSheetsPreview.tsx`
7. **Create**: `src/components/preview/DocumentPreview.tsx`
8. **Edit**: `src/components/order/PreviewPanel.tsx` — use `DocumentPreview`
9. **Edit**: `src/components/order/PreviewLightbox.tsx` — use `DocumentPreview`

