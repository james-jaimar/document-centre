

# Fix FlipBook Preview — Make It Work Like Mimeo

## Problems identified

1. **Preview type derivation is silently failing** — The `productType` stays as `"loose_sheets"` so the FlipBook never renders. Most likely cause: the `options` data hasn't loaded yet when the `useMemo` runs, or the `spec.selected_options["Binding"]` key doesn't match the option's `name` field. Adding console logging will confirm the exact failure point.

2. **FlipBook component needs improvements** — Even once it activates, it currently shows a single page with no visible interactivity. Mimeo's version shows:
   - Cover page displayed alone initially (single page)
   - After flipping cover: two-page spread (left + right pages visible)
   - Spiral binding graphic running down the left spine
   - Page numbers below each page in the spread
   - Click/drag to flip pages with realistic animation

3. **BindingSpine overlay is CSS-only** — needs to look more like Mimeo's spiral with individual coil rings visible

## Plan

### 1. Debug and fix productType derivation (`OrderBuild.tsx`)

Add `console.log` to trace the exact values at each step of the binding detection chain:
- Log `options` array length, the found binding option, the selected slug, the matched value, and the extracted `binding_method`
- This will reveal exactly where the chain breaks

Most likely fix: the option name in the DB may differ from `"Binding"` (e.g., stored with different casing or spacing). Will add a case-insensitive lookup as a fallback.

### 2. Improve FlipBook component (`FlipBook.tsx`)

- Fix the page sizing calculation — currently `pageWidth = width / 2` then derives height from that, but this can produce dimensions that are too large for the container, causing react-pageflip to not render
- Add `usePortrait: false` to ensure two-page spread mode (already set, but verify it works with the calculated dimensions)
- Ensure `showCover: true` so page 1 displays alone as a cover, then pages 2-3 show as a spread when you flip
- Add page number labels below each visible page (like Mimeo shows "8" and "9")
- Make the container sizing more robust with proper min/max constraints

### 3. Enhance BindingSpine (`BindingSpine.tsx`)

Make the spiral/coil binding look more realistic (like Mimeo's):
- For `coil`/`wire` types: render individual spiral rings as small circles or arcs running vertically along the left spine
- Position them at regular intervals (every ~15-20px)
- Use a subtle metallic gradient for each ring
- The spine sits at the left edge of the book (not center) since spiral-bound books have the binding on the left side

### 4. Add page number display below the book spread

Below the FlipBook, show the current page numbers (e.g., "8" under left page, "9" under right page) like Mimeo does.

### 5. Wire up navigation controls

The PreviewPanel's slider and arrow buttons need to call `flipBookRef.current.pageFlip().flip(pageNum)` to programmatically turn pages in sync with the slider.

## Files to edit

1. **`src/pages/dashboard/OrderBuild.tsx`** — Add debug logging to productType derivation; add case-insensitive option name lookup
2. **`src/components/preview/FlipBook.tsx`** — Fix page sizing, add page numbers, improve spine positioning
3. **`src/components/preview/BindingSpine.tsx`** — More realistic spiral rings
4. **`src/components/preview/DocumentPreview.tsx`** — Minor: pass debug info through

