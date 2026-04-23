

## Fix LooseSheetsPreview sizing for landscape documents (business cards, etc.)

### Problem

`LooseSheetsPreview` uses portrait-biased sizing: it caps page width at `width * 0.65` and derives height from that. For a 90x50mm business card (aspect ratio 1.8), this produces a tiny card with excessive white space around it. The `pageAspectRatio` is already correctly computed from the document's real mm dimensions — the rendering just wastes the available space.

### Fix in `src/components/preview/LooseSheetsPreview.tsx`

Replace the current single-path sizing with aspect-ratio-aware logic:

```ts
const ratio = pageAspectRatio ?? 0.707;
const isLandscape = ratio > 1;

// Fit the page to available space, respecting aspect ratio
const maxW = width * (isLandscape ? 0.85 : 0.65);
const maxH = height * 0.85;

// Scale to fit whichever dimension is the constraint
let pageWidth = maxW;
let pageHeight = pageWidth / ratio;
if (pageHeight > maxH) {
  pageHeight = maxH;
  pageWidth = pageHeight * ratio;
}
```

This ensures:
- **90x50mm business cards** (ratio 1.8): fill ~85% of container width, correct proportions
- **A4 portrait** (ratio 0.707): behaves as before, height-constrained
- **Any other size**: scales correctly to fit the container while preserving the document's true aspect ratio

### Files to change

| File | Change |
|---|---|
| `src/components/preview/LooseSheetsPreview.tsx` | Replace sizing calculation with aspect-ratio-aware fit logic |

