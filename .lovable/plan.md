

## Fix: Page numbering in preview footer shows raw indices for tabs/inserts

### Problem
The content-only numbering logic was added to `displayPageNumbers` (returns `null` for tabs, inserts, blank backs), but the FlipBook footer uses `displayPageNumbers?.[idx] ?? currentPage` — so when a face is `null`, it falls back to the raw 0-based array index. This produces confusing numbers like 4,4 or 6,8 or 9,7.

### Fix

**`src/components/preview/FlipBook.tsx`** — Update the footer to display friendly role labels for non-content faces instead of falling back to raw indices.

1. Accept `pageRoles` (or a `faceLabels: string[]`) as a new prop alongside `displayPageNumbers`
2. Create a helper that returns either `"Page N"` (when displayPageNumbers entry is a number) or a friendly role name like `"Tab Divider"`, `"Insert Sheet"`, `"Blank"` (when null)
3. Update the three footer `<span>` elements to use this helper instead of the `?? currentPage` fallback

**`src/components/preview/DocumentPreview.tsx`** — Thread the new prop from PreviewPanel through to FlipBook.

**`src/components/order/PreviewPanel.tsx`** — Compute a `faceLabels: string[]` array (one entry per face) using the existing `faceLabel()` function, and pass it down to DocumentPreview.

### Result
- Content pages show "Page 4", "Page 5", etc. — matching the Tab/Insert drawer numbering
- Tab faces show "Tab Divider", insert faces show "Insert Sheet", blank backs show "Blank"
- Left and right sides of a spread each show their own correct label

