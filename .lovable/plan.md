

# Plan: Fix Fold Preview for Brochures

## Problems

### 1. Page sequence pollution
`PreviewPanel` runs ALL pages through `buildPageSequence`, which adds `blank_back` faces for simplex sections. A 2-page brochure PDF becomes 4 entries (page1, blank_back, page2, blank_back). `FoldPreview` receives 4 thumbnail paths — 2 real + 2 empty — and the panel clipping breaks.

### 2. FoldPreview receives wrong data
`FoldPreview` expects exactly 2 URLs: `urls[0]` = front of sheet, `urls[1]` = back of sheet. It uses CSS clipping to split each full-page thumbnail into panels. With extra blank entries, it shows broken/empty panels.

### 3. Fold animation issues
- `backfaceVisibility: "hidden"` prevents seeing the back side when panels fold over
- Z-fold panels need different fold directions (accordion-style) vs tri-fold (roll-fold)
- The "Show Back" button works but the back-side panel order should be reversed (mirror of front)

## Solution

### PreviewPanel: bypass page sequence for fold types
When `isFold` is true, skip `buildPageSequence` entirely. Instead, extract raw thumbnail URLs directly from documents — just the actual PDF page thumbnails (page 1 = front sheet, page 2 = back sheet). Pass these directly to `DocumentPreview`.

### FoldPreview: fix animations and panel rendering

**Bi-fold** (1 fold, 4 panels = 2 per side):
- Front: 2 panels side by side. Right panel folds onto left (like closing a book)
- Back: 2 panels, mirrored order

**Tri-fold / Roll-fold** (2 folds, 6 panels = 3 per side):
- Front: 3 panels. Right panel folds left over center, then left panel folds right over both
- The key difference from Z-fold is that panels fold in the same direction (roll)

**Z-fold / Accordion** (2 folds, 6 panels = 3 per side):
- Front: 3 panels. Right panel folds left, left panel folds right (accordion/zigzag)
- Panels fold in alternating directions

**Gate-fold** (2 folds, 4–6 panels):
- Left and right "gate" panels fold inward over the center

**Back side**: When viewing back, reverse the panel order (panels are mirrored when you flip a sheet) and use `urls[1]` for clipping.

**Remove `backfaceVisibility: "hidden"`** — it prevents seeing content when panels rotate past 90°. Instead, use proper z-index management during animation.

## Changes

| File | Change |
|------|--------|
| `src/components/order/PreviewPanel.tsx` | When `isFold`, build `thumbnailPaths` directly from document `thumbnail_urls` (no blank_back injection). Skip all bound-document post-processing. |
| `src/components/preview/FoldPreview.tsx` | Rewrite fold animations: remove `backfaceVisibility`, fix z-index layering during fold/unfold transitions, reverse panel order for back side, improve fold geometry for each type. |

## Implementation Order
1. Fix PreviewPanel to bypass page sequence for folds
2. Rewrite FoldPreview with correct fold mechanics

