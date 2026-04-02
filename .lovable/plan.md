

# Plan: Fix Fold Preview Showing "No pages to preview"

## Problem

Line 345: `const totalPages = finalPages.length;`
Line 413: `if (totalPages === 0)` → returns the empty state.

For fold types, `pages` is intentionally set to `[]` (line 233), so `finalPages` is also empty. The `foldThumbnails` array has the actual URLs, but the empty-state guard only checks `finalPages.length` — it never reaches the `DocumentPreview` render.

## Fix

**`src/components/order/PreviewPanel.tsx`** — one-line change:

Update the empty-state check (line 413) to also consider fold thumbnails:

```typescript
if (totalPages === 0 && (!foldThumbnails || foldThumbnails.length === 0)) {
```

This lets fold types pass through to `DocumentPreview` even when `finalPages` is empty (which is correct — folds don't use the page sequence model).

## Changes

| File | Change |
|------|--------|
| `src/components/order/PreviewPanel.tsx` | Update empty-state guard at line 413 to allow fold types with thumbnails to render |

