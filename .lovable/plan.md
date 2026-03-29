

# Fix Margin Drift + Complete Deterministic Page Rendering

## Root cause analysis

The margin instability comes from **two competing sources of truth**:

1. **PageEffects computes bleed from `effects` + role inference** — it re-derives `isBleedForThisPage` every render using `effects.bleed` and the role string. When the `bookKey` forces a remount of `react-pageflip`, the library's internal canvas rendering can capture pages at slightly different CSS-resolution moments, causing the `padding: "3%"` (which is relative to element width) to resolve to different pixel values.

2. **CSS percentage padding is unstable across remounts** — `padding: "3%"` in CSS resolves to 3% of the element's **width**, not height. During a `react-pageflip` remount (triggered by bookKey change), the library may measure/paint pages before the final layout settles, capturing an intermediate padding state.

## Fix approach

### 1. Compute `allowBleed` per-page in PreviewPanel (upstream, once)

Add an `allowBleed` boolean array alongside `pageRoles`, `colorFlags`, and `sectionTypes`. Each page gets an explicit bleed decision computed **once** from:
- the page's physical role
- the selected bleed scope
- the section type

This removes all bleed inference from `PageEffects`.

**PreviewPanel.tsx changes:**
- After building `finalPages` and `pageRoles`, compute `bleedFlags: boolean[]`
- Pass `bleedFlags` through DocumentPreview → FlipBook → FlipPage → PageEffects

### 2. Replace percentage padding with fixed pixel inset

Instead of `padding: "3%"` (which shifts with container width during remounts), compute a fixed pixel margin from the known `pageWidth` and pass it as a prop. This makes the bleed inset immune to CSS-resolution timing.

**FlipBook.tsx changes:**
- Compute `bleedInsetPx = Math.round(pageWidth * 0.03)` once
- Pass it to each FlipPage → PageEffects as a number

**PageEffects.tsx changes:**
- Accept `allowBleed: boolean` and `bleedInsetPx: number` as props
- If `!allowBleed`, apply `padding: ${bleedInsetPx}px` (fixed pixels)
- If `allowBleed`, no padding
- Remove the `effects.bleed` + role inference block entirely

### 3. Thread new props through the component chain

Add to interfaces:
- `PreviewComponentProps` / `FlipBookProps`: `bleedFlags?: boolean[]`, `bleedInsetPx?: number`
- `PageEffectsProps`: `allowBleed: boolean`, `bleedInsetPx: number`
- `DocumentPreviewProps`: `bleedFlags?: boolean[]`

### 4. Clamp currentPage on model change

In PreviewPanel, when `finalPages.length` changes, clamp `currentPage` to stay in bounds. This prevents stale page indices from causing wrong role lookups after option changes.

## Files to edit

- `src/components/order/PreviewPanel.tsx` — compute `bleedFlags` array
- `src/components/preview/previewTypes.ts` — add `bleedFlags` to interface
- `src/components/preview/DocumentPreview.tsx` — pass through `bleedFlags`
- `src/components/preview/FlipBook.tsx` — compute `bleedInsetPx`, pass to FlipPage/PageEffects
- `src/components/preview/PageEffects.tsx` — consume explicit `allowBleed` + `bleedInsetPx`, remove inference

## Expected result
- Margins never jump because bleed is a fixed pixel value computed once per page
- Changing options triggers a clean remount with pre-computed, stable page metadata
- No CSS percentage resolution timing issues
- PVC front, card backs, blank pages all unaffected (they bypass bleed entirely)

