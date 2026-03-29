

# Fix Insert Physics + Prominent Tab Rendering

## Problem 1: Breaking the laws of physics

In a duplex (double-sided) document, each physical sheet has two faces. Pages 1-2 = sheet 1, pages 3-4 = sheet 2, etc. Inserting a colored sheet "after page 9" would split sheet 5 in half — physically impossible.

**Current code** in `buildPageSequence` injects anchored items after every body page regardless of whether that page is a sheet boundary:

```
pageNum++;
push(body page);
if (!duplex) push(blank_back);  // simplex = every page is a sheet boundary
inject anchored items for pageNum;  // BUG: duplex page 9 is NOT a sheet boundary
```

**Fix — two layers:**

1. **Drawer UI (`TabInsertDrawer.tsx`)**: Only offer valid "after page" positions. For duplex sections, only show even page numbers (sheet backs). For simplex, every page is valid. This prevents the user from ever selecting an impossible position.

2. **Preview engine (`PreviewPanel.tsx`)**: As a safety net, if an anchor falls on the front face of a duplex sheet (odd page), auto-snap it forward to the next even page before injection. This handles legacy data.

## Problem 2: Tiny tabs

Current tab protrusion: 18px wide × 32px tall with 7px font. Barely visible.

**Fix in `FlipBook.tsx`**: Make tabs much more prominent — wider (28-30px), taller (48-50px), with larger readable label text (9-10px). Add a subtle paper texture background. The tab should look like a physical tab divider protruding from the page edge, matching the Mimeo reference.

## Files to edit

- `src/components/order/TabInsertDrawer.tsx` — filter "After Page" dropdown to only show sheet-boundary pages
- `src/components/order/PreviewPanel.tsx` — snap non-boundary anchors to next valid position
- `src/components/preview/FlipBook.tsx` — enlarge tab protrusion dimensions and label styling

## Expected result

- User can only place inserts/tabs at physically valid positions (between sheets)
- Duplex documents show only even pages in the dropdown (After Page 2, 4, 6, 8...)
- Simplex documents show all pages (every page is a sheet boundary)
- Tabs are prominently visible with readable labels protruding from the page edge

