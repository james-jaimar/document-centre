

# Visual Finishing Effects in the FlipBook Preview

## Overview

Enhance the preview to reflect finishing options the user selects, so they see a realistic representation of the final product. This reads metadata from the selected product options and applies visual CSS effects to the FlipBook pages.

## Options that affect the preview

After reviewing all product options in `seedBoundDocument.ts`, here are the ones with visual impact, ranked by importance:

| Option | Metadata key | Visual effect |
|--------|-------------|---------------|
| **Print to Edge** | `bleed: false` | Inset white border (~5mm scaled) around the thumbnail image |
| **Covers (front)** | `front: "clear_pvc"` / `"frosted_pvc"` / `"matte_pvc"` | Translucent/frosted overlay on the first page |
| **Covers (back)** | `back: "black_card"` / `"white_card"` / `"navy_card"` | Solid-color last page |
| **Paper Stock** | `color: "pastel_blue"` etc. | Tinted page background behind thumbnail |
| **Hole Punching** | `holes: 2` / `4` | Small circular cutouts along the left edge |
| **Cover Lamination** | `finish: "gloss"` | Subtle glossy sheen gradient overlay on cover pages |

## Technical approach

### 1. Build a `PreviewEffects` object in `OrderBuild.tsx`

Read the selected options' metadata and produce a typed object:

```typescript
interface PreviewEffects {
  bleed: boolean;           // Print to Edge
  frontCover: "none" | "clear_pvc" | "frosted_pvc" | "matte_pvc" | "white_card" | "silk_card" | "gloss_card";
  backCover: "none" | "black_card" | "white_card" | "navy_card" | "silk_card" | "gloss_card";
  paperColor: string;       // "white" | "pastel_blue" | "pastel_green" etc.
  holePunch: 0 | 2 | 4;
  coverLamination: "none" | "gloss" | "matt" | "soft_touch";
}
```

Pass this down through `PreviewPanel → DocumentPreview → FlipBook`.

### 2. Modify `FlipPage` in `FlipBook.tsx`

The `FlipPage` component currently renders a simple `<img>`. Enhance it to:

- **Bleed off (default)**: Add `padding: 3%` to the image container, with a white background visible around the edges — simulates the unprintable margin
- **Bleed on**: Image fills edge-to-edge (current behavior)
- **Clear/Frosted front cover**: On page index 0, overlay a `<div>` with `background: rgba(255,255,255,0.15)` (clear) or `rgba(255,255,255,0.4) + backdrop-filter: blur(1px)` (frosted) — the content shows through with a translucent sheet effect
- **Colored back cover**: On the last page, render a solid-color div instead of the thumbnail (`bg-gray-900` for black, `bg-white` for white, `bg-blue-900` for navy)
- **Paper color**: Set page background to the pastel color (`bg-blue-100`, `bg-green-100`, etc.) — visible if the PDF content doesn't fill the page
- **Hole punch**: Render 2 or 4 small `border-radius: 50%` divs along the left edge of each page, positioned absolutely
- **Gloss lamination on covers**: Add a diagonal gradient overlay (`linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)`) on cover pages

### 3. Prop threading

```text
OrderBuild (derives PreviewEffects from spec + options metadata)
  → PreviewPanel (passes through)
    → DocumentPreview (passes through)
      → FlipBook (applies per-page)
        → FlipPage (renders effects)
```

### 4. Files to edit

1. **`src/components/preview/previewTypes.ts`** — Add `PreviewEffects` interface and add it to `PreviewComponentProps`
2. **`src/components/preview/FlipBook.tsx`** — Enhance `FlipPage` to render bleed margins, cover overlays, paper tint, hole punch marks, lamination sheen
3. **`src/components/preview/DocumentPreview.tsx`** — Pass `effects` prop through
4. **`src/components/order/PreviewPanel.tsx`** — Accept and pass `effects` prop
5. **`src/pages/dashboard/OrderBuild.tsx`** — Derive `PreviewEffects` from selected options metadata
6. **`src/components/preview/LooseSheetsPreview.tsx`** — Apply same bleed/paper effects for loose sheets

## What stays the same

- All option definitions and metadata — unchanged
- OptionsPanel, PriceSummary — unchanged
- BindingSpine — unchanged
- No database changes

