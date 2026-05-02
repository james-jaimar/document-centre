
## Problem

Two bugs found:

### Bug 1: Preview shows colour when B&W is selected (Loose Sheets / Stapled)

`LooseSheetsPreview.tsx` (used for stapled and loose pages) completely ignores the `colorFlags` prop. It destructures only `bleedFlags` and never applies a grayscale CSS filter. By contrast, `FlipBook.tsx` and `RingBinderOpenSpread.tsx` correctly apply `filter: grayscale(100%)` when `isColor` is false.

`FoldPreview.tsx` has the same gap -- it also ignores `colorFlags`.

### Bug 2: Backend grayscale conversion is too aggressive

In `useCart.ts` (line ~587-600), the grayscale trigger uses `anyBW` -- if ANY section is B&W, ALL documents for that order item get converted to grayscale. This is wrong for mixed-colour orders (e.g. colour cover + B&W body): the cover document should stay colour.

The fix is to match each document to its section(s) and only convert documents whose section is actually B&W.

---

## Plan

### 1. Fix LooseSheetsPreview to apply grayscale filter

In `src/components/preview/LooseSheetsPreview.tsx`:
- Destructure `colorFlags` from props
- Apply `style={{ filter: isColor ? "none" : "grayscale(100%)" }}` on the `<img>` element, using `colorFlags?.[currentPage] ?? true`

### 2. Fix FoldPreview to apply grayscale filter

In `src/components/preview/FoldPreview.tsx`:
- Same pattern: destructure `colorFlags`, apply grayscale filter to rendered page images

### 3. Fix per-document grayscale targeting in order placement

In `src/hooks/useCart.ts` (~line 586-637):
- Instead of `anyBW` across all sections, determine per-document whether it needs grayscale by checking only the sections that reference that specific document
- Change `needsGrayscale` to be `true` only when the document's own section has `is_color === false`

---

## Technical Details

**LooseSheetsPreview.tsx** change:
```tsx
// Destructure colorFlags
const isColor = colorFlags?.[currentPage] ?? true;

// On the <img>:
style={{ filter: isColor ? "none" : "grayscale(100%)" }}
```

**useCart.ts** change (line ~597-600):
```ts
for (const doc of itemDocs) {
  if (!doc.backend_asset_id) continue;
  // Only grayscale if THIS doc's section is B&W
  const docSections = itemSections.filter((s: any) => s.document_id === doc.id);
  const needsGrayscale = docSections.some((s: any) => !s.is_color);
  ...
}
```
